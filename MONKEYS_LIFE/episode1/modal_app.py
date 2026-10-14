"""GPU side of the free route: open models on Modal (its free monthly credit), driven by ai_video.py --model ltx.

Stills (cast pictures and the first frame of every shot with a character in it): Qwen-Image and Qwen-Image-Edit
(Apache-2.0). Clips: LTX (Lightricks; LTX-2.x Community License, free under $10M yearly revenue), image- or
text-to-video WITH sound:
  - no HF_TOKEN (default): LTX-2.3 from the open repos (diffusers/LTX-2.3-Diffusers + the distilled LoRA from
    Lightricks/LTX-2.3), 8 steps, one stage at 960x544. Needs no Hugging Face account.
  - HF_TOKEN set (an account that pressed "Agree and access" on huggingface.co/Lightricks/LTX-2.5): LTX-2.5 distilled,
    two stages (half size, then 2x up and refined) at 1280x704.
Needs MODAL_TOKEN_ID / MODAL_TOKEN_SECRET in the environment of whoever runs it (GitHub secrets).
Model files are cached in the Modal volume "monkeys-life-models" (1 TiB is free), so only the first run downloads them.
"""
import io, os, time
import modal

app = modal.App('monkeys-life-ep1')
models = modal.Volume.from_name('monkeys-life-models', create_if_missing=True)
DIFFUSERS = 'diffusers @ git+https://github.com/huggingface/diffusers@efe46a5b177af67c64b3666da8ddddac7ee12163'
image = (modal.Image.debian_slim(python_version='3.12')
         .apt_install('ffmpeg', 'git')
         .uv_pip_install('torch==2.9.1', 'torchvision==0.24.1', 'transformers==5.19.0', 'accelerate>=1.10', 'safetensors>=0.8',
                         'sentencepiece', 'huggingface_hub[hf_xet]>=1.32', 'av', 'imageio', 'imageio-ffmpeg', 'pillow', 'numpy',
                         'peft>=0.17', DIFFUSERS)
         .env({'HF_HOME': '/models/hf', 'HF_XET_HIGH_PERFORMANCE': '1', 'TOKENIZERS_PARALLELISM': 'false'}))
secrets = [modal.Secret.from_dict({'HF_TOKEN': os.environ['HF_TOKEN']})] if os.environ.get('HF_TOKEN') else []
EDIT_MODELS = ['Qwen/Qwen-Image-Edit-2511', 'Qwen/Qwen-Image-Edit-2509']       # first that loads wins
T2I_MODELS = ['Qwen/Qwen-Image-2512', 'Qwen/Qwen-Image']
LTX = 'Lightricks/LTX-2.5-Diffusers'                                           # gated: needs HF_TOKEN
LTX_OPEN = 'diffusers/LTX-2.3-Diffusers'                                        # open
LTX_OPEN_LORA = ('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-lora-384-1.1.safetensors')
OPEN_W, OPEN_H = 960, 544


def _first(loader, names):
    err = None
    for name in names:
        try: return loader(name), name
        except Exception as e: err = e; print('could not load', name, '-', str(e)[:200], flush=True)
    raise err


def _jpeg(img, q=94):
    b = io.BytesIO(); img.convert('RGB').save(b, 'JPEG', quality=q); return b.getvalue()


@app.cls(gpu='H100', image=image, volumes={'/models': models}, secrets=secrets, timeout=4 * 3600, memory=65536,
         scaledown_window=20)
class Stills:
    """Pictures: text to image when a job has no refs, otherwise an edit that keeps the people in the refs."""

    @modal.method(is_generator=True)
    def make(self, jobs, deadline=None):
        """jobs (in order): [{name, prompt, refs: [jpeg bytes or '@name' of an earlier job], w, h, steps, seed}]
        -> yields (name, jpeg bytes | None, note)."""
        import torch
        from PIL import Image
        from diffusers import QwenImagePipeline, QwenImageEditPlusPipeline
        pipes = {}; made = {}

        def pipe(kind):
            if kind not in pipes:
                for k in list(pipes): del pipes[k]
                torch.cuda.empty_cache()
                cls, names = (QwenImageEditPlusPipeline, EDIT_MODELS) if kind == 'edit' else (QwenImagePipeline, T2I_MODELS)
                p, name = _first(lambda n: cls.from_pretrained(n, torch_dtype=torch.bfloat16), names)
                pipes[kind] = p.to('cuda'); print('loaded', name, flush=True); models.commit()
            return pipes[kind]
        for job in jobs:
            if deadline and time.time() > deadline: yield job['name'], None, 'not made: out of time for this run'; continue
            t = time.time()
            try:
                g = torch.Generator('cuda').manual_seed(int(job.get('seed', 7)))
                args = dict(prompt=job['prompt'], width=job['w'], height=job['h'], num_inference_steps=job.get('steps', 30),
                            generator=g, true_cfg_scale=4.0, negative_prompt=job.get('negative', ' '))
                if job.get('refs'):
                    refs = [made[r[1:]] if isinstance(r, str) else r for r in job['refs']]
                    args['image'] = [Image.open(io.BytesIO(b)).convert('RGB') for b in refs]
                    out = pipe('edit')(**args).images[0]
                else:
                    out = pipe('t2i')(**args).images[0]
                made[job['name']] = _jpeg(out)
                yield job['name'], made[job['name']], f'made in {time.time() - t:.0f} s'
            except Exception as e:
                yield job['name'], None, f'failed after {time.time() - t:.0f} s: ' + str(e)[:400]


@app.cls(gpu='H100', image=image, volumes={'/models': models}, secrets=secrets, timeout=4 * 3600, memory=131072,
         scaledown_window=20)
class Clips:
    """Video with sound. A job with an image starts from it (image-to-video); without one it is text-to-video."""

    @modal.enter()
    def load(self):
        import torch
        from diffusers import FlowMatchEulerDiscreteScheduler, LTX2ImageToVideoPipeline, LTX2Pipeline
        from diffusers.pipelines.ltx2 import LTX2LatentUpsamplePipeline
        from diffusers.pipelines.ltx2.latent_upsampler import LTX2LatentUpsamplerModel
        t = time.time(); self.up = None
        if os.environ.get('HF_TOKEN'):                                           # LTX-2.5, two stages
            self.i2v = LTX2ImageToVideoPipeline.from_pretrained(LTX, torch_dtype=torch.bfloat16)
            up = LTX2LatentUpsamplerModel.from_pretrained(LTX, subfolder='latent_upsampler', torch_dtype=torch.bfloat16)
            self.up = LTX2LatentUpsamplePipeline(vae=self.i2v.vae, latent_upsampler=up)
            self.up.enable_model_cpu_offload(); self.name = 'LTX-2.5'
        else:                                                                    # LTX-2.3 + distilled LoRA, one stage
            self.i2v = LTX2ImageToVideoPipeline.from_pretrained(LTX_OPEN, torch_dtype=torch.bfloat16)
            self.i2v.load_lora_weights(LTX_OPEN_LORA[0], weight_name=LTX_OPEN_LORA[1], adapter_name='distilled')
            self.i2v.set_adapters('distilled', 1.0)
            self.i2v.scheduler = FlowMatchEulerDiscreteScheduler.from_config(
                self.i2v.scheduler.config, use_dynamic_shifting=False, shift_terminal=None)  # use the sigmas as given
            self.name = 'LTX-2.3'
        self.i2v.enable_model_cpu_offload()
        self.t2v = LTX2Pipeline.from_pipe(self.i2v)
        models.commit(); print(f'{self.name} loaded in {time.time() - t:.0f} s', flush=True)

    @modal.method(is_generator=True)
    def make(self, jobs, deadline=None):
        """jobs: [{n, prompt, image: jpeg bytes | None, secs, w, h, seed, two_stage}] -> yields (n, mp4 bytes | None, note)."""
        import tempfile, torch
        from PIL import Image
        from diffusers.utils import encode_video
        from diffusers.pipelines.ltx2.utils import DISTILLED_SIGMA_VALUES as S1, STAGE_2_DISTILLED_SIGMA_VALUES as S2
        quiet = dict(guidance_scale=1.0, audio_guidance_scale=1.0, stg_scale=0.0, audio_stg_scale=0.0,
                     modality_scale=1.0, audio_modality_scale=1.0)                     # distilled: no guidance
        for job in jobs:
            if deadline and time.time() > deadline: yield job['n'], None, 'not made: out of time for this run'; continue
            t = time.time()
            try:
                frames = ((round(job['secs'] * 24) - 1 + 7) // 8) * 8 + 1                # LTX wants 8k+1 frames
                w, h = job['w'], job['h']; g = torch.Generator('cuda').manual_seed(int(job.get('seed', 11)))
                img = Image.open(io.BytesIO(job['image'])).convert('RGB') if job.get('image') else None
                pipe = self.i2v if img is not None else self.t2v
                cond = dict(image=img) if img is not None else {}
                common = dict(prompt=job['prompt'], num_frames=frames, frame_rate=24.0, generator=g, return_dict=False, **quiet)
                if self.up is None: w, h = OPEN_W, OPEN_H                          # open route: one stage, smaller
                if self.up is not None and job.get('two_stage', True):
                    self.i2v.vae.disable_tiling()
                    vlat, alat = pipe(**cond, **common, width=w // 2, height=h // 2, sigmas=S1, output_type='latent')
                    vlat = self.up(latents=vlat, latents_normalized=False, output_type='latent', return_dict=False)[0]
                    self.i2v.vae.enable_tiling()
                    video, audio = pipe(**cond, **common, width=w, height=h, latents=vlat, audio_latents=alat, sigmas=S2,
                                        noise_scale=S2[0], output_type='np')
                else:
                    self.i2v.vae.enable_tiling()
                    video, audio = pipe(**cond, **common, width=w, height=h, sigmas=S1, output_type='np')
                with tempfile.TemporaryDirectory() as tmp:
                    path = os.path.join(tmp, 'clip.mp4')
                    encode_video(video[0], fps=24, audio=audio[0].float().cpu(),
                                 audio_sample_rate=self.i2v.vocoder.config.output_sampling_rate, output_path=path)
                    data = open(path, 'rb').read()
                yield job['n'], data, f'made with {self.name} at {w}x{h} in {time.time() - t:.0f} s'
            except Exception as e:
                torch.cuda.empty_cache()
                yield job['n'], None, f'failed after {time.time() - t:.0f} s: ' + str(e)[:400]
