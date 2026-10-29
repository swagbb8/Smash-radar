"""Free GPU route: runs jobs on Kaggle (2x T4, ~30 GPU h a week; token in ~/.kaggle/access_token, account ashton2387).

Each call pushes one private Kaggle script (kernel) with the jobs baked in, waits for it, and downloads what it made.
    stills: Qwen-Image (4-bit NF4, Apache-2.0) text to image; jobs [{name, prompt, negative, w, h, steps, seed}]
Used by cast_kaggle.py; can be run by hand:  python kaggle_run.py stills <jobs.json> <out folder>
"""
import json, os, shutil, subprocess, sys, tempfile, time

USER = 'ashton2387'

STILLS = r'''
import json, os, subprocess, sys, time
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'diffusers', 'transformers', 'accelerate', 'peft',
                'bitsandbytes', 'sentencepiece'], check=True)
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
import math, torch
from diffusers import QwenImagePipeline, QwenImageTransformer2DModel, BitsAndBytesConfig, FlowMatchEulerDiscreteScheduler
from transformers import Qwen2_5_VLForConditionalGeneration, BitsAndBytesConfig as TBnb
JOBS = json.loads(%r)
os.makedirs('/kaggle/working/out', exist_ok=True)
import numpy as np
R = 'Qwen/Qwen-Image'; BF = torch.bfloat16
# two T4s: the 4-bit text encoder on GPU 1 (bf16), the 4-bit transformer + VAE on GPU 0 (no offloading).
# The transformer runs in fp16 when that gives a real picture (T4s have no native bf16: bf16 took ~30 min a picture).
t = time.time()
te = Qwen2_5_VLForConditionalGeneration.from_pretrained(R, subfolder='text_encoder', torch_dtype=BF, device_map={'': 1},
        quantization_config=TBnb(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=BF))
pipe = None


def vae_dev(p):
    """The VAE lives on GPU 1: send it latents from GPU 0 (and pictures to encode) and hand results back on GPU 0."""
    enc, dec = p.vae.encode, p.vae.decode
    p.vae.decode = lambda z, *a, **k: dec(z.to('cuda:1'), *a, **k)
    def e(x, *a, **k):
        r = enc(x.to('cuda:1'), *a, **k); return r
    p.vae.encode = e


def load(dt):
    global pipe
    if pipe is not None: del pipe.transformer; pipe = None; torch.cuda.empty_cache()
    t = time.time()
    tr = QwenImageTransformer2DModel.from_pretrained(R, subfolder='transformer', torch_dtype=dt, device_map={'': 0},
            quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=dt))
    sched = FlowMatchEulerDiscreteScheduler.from_config(dict(base_image_seq_len=256, base_shift=math.log(3), invert_sigmas=False,
            max_image_seq_len=8192, max_shift=math.log(3), num_train_timesteps=1000, shift=1.0, shift_terminal=None,
            stochastic_sampling=False, time_shift_type='exponential', use_beta_sigmas=False, use_dynamic_shifting=True,
            use_exponential_sigmas=False, use_karras_sigmas=False))
    pipe = QwenImagePipeline.from_pretrained(R, transformer=tr, text_encoder=te, scheduler=sched, torch_dtype=dt)
    pipe.load_lora_weights('lightx2v/Qwen-Image-Lightning', weight_name='Qwen-Image-Lightning-8steps-V2.0-bf16.safetensors')
    pipe.vae.to('cuda:1', dtype=dt); pipe.vae.enable_tiling(); vae_dev(pipe)          # GPU 0 is full with the LoRA
    type(pipe)._execution_device = property(lambda self: torch.device('cuda:0'))   # latents + denoising on GPU 0
    print(f'loaded {dt} in {time.time() - t:.0f} s', flush=True)


def make(j, dt):
    with torch.no_grad():
        pe, pm = pipe.encode_prompt(prompt=j['prompt'], device='cuda:1')
    to0 = lambda x: x.to('cuda:0', dtype=dt if x.is_floating_point() else x.dtype) if x is not None else None
    return pipe(prompt_embeds=to0(pe), prompt_embeds_mask=to0(pm), width=j['w'], height=j['h'],
                num_inference_steps=8, true_cfg_scale=1.0,                     # Lightning LoRA: 8 steps, no CFG pass
                generator=torch.Generator('cpu').manual_seed(int(j.get('seed', 7)))).images[0]


dt = BF; load(dt)                    # fp16 was tried: Qwen-Image gives a blank picture in fp16, so bf16 it is (~20 min a picture)
for i, j in enumerate(JOBS):
    t = time.time()
    try:
        img = make(j, dt)
        img.convert('RGB').save(f"/kaggle/working/out/{j['name']}.jpg", quality=94)
        print('made', j['name'], f'{time.time() - t:.0f} s', flush=True)
    except Exception as e:
        print('failed', j['name'], str(e)[:300], flush=True)
    torch.cuda.empty_cache()
'''

KEYS = r'''
import json, math, os, subprocess, sys, time
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'diffusers', 'transformers', 'accelerate', 'peft',
                'bitsandbytes', 'sentencepiece'], check=True)
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
import glob, torch
from PIL import Image
from diffusers import QwenImageEditPlusPipeline, QwenImageTransformer2DModel, BitsAndBytesConfig, FlowMatchEulerDiscreteScheduler
from transformers import Qwen2_5_VLForConditionalGeneration, BitsAndBytesConfig as TBnb
JOBS = json.loads(%r)
def find(f):
    """An uploaded picture, wherever Kaggle mounted the dataset."""
    hits = glob.glob('/kaggle/input/**/' + f, recursive=True)
    if not hits: raise FileNotFoundError(f + ' not in ' + str(glob.glob('/kaggle/input/**', recursive=True)[:20]))
    return hits[0]
os.makedirs('/kaggle/working/out', exist_ok=True)
R = 'Qwen/Qwen-Image-Edit-2509'; BF = torch.bfloat16; t = time.time()
# Qwen-Image-Edit-2509 (4-bit) + the Lightning 8-step LoRA, in two passes so neither model shares a GPU with the other:
# 1) the text encoder reads every prompt (with its cast pictures) and is freed, 2) the transformer is split over both GPUs
import diffusers.pipelines.qwenimage.pipeline_qwenimage_edit_plus as EP
nf4 = dict(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=BF)
te = Qwen2_5_VLForConditionalGeneration.from_pretrained(R, subfolder='text_encoder', torch_dtype=BF, device_map={'': 0},
        quantization_config=TBnb(**nf4))
pipe = QwenImageEditPlusPipeline.from_pretrained(R, transformer=None, vae=None, text_encoder=te, torch_dtype=BF)
refs, embeds = {}, {}
for j in JOBS:
    try:
        refs[j['name']] = [Image.open(find(r)).convert('RGB') for r in j['refs']]
        cond = []
        for im in refs[j['name']]:                     # the encoder sees each picture at 384x384-ish, as in the pipeline
            w, h = EP.calculate_dimensions(EP.CONDITION_IMAGE_SIZE, im.width / im.height)
            cond.append(pipe.image_processor.resize(im, h, w))
        with torch.no_grad():
            pe, pm = pipe.encode_prompt(prompt=j['prompt'], image=cond or None, device='cuda:0')
        embeds[j['name']] = (pe.cpu(), pm.cpu() if pm is not None else None)
    except Exception as e:
        import traceback; traceback.print_exc()
        print('failed', j['name'], str(e)[:300], flush=True)
del pipe, te; import gc; gc.collect(); torch.cuda.empty_cache()
print(f'prompts encoded in {time.time() - t:.0f} s', flush=True)
# the small input/output layers stay bf16: 4-bit there adds grain to every step's prediction
tr = QwenImageTransformer2DModel.from_pretrained(R, subfolder='transformer', torch_dtype=BF, device_map={'': 0},
        quantization_config=BitsAndBytesConfig(**nf4, llm_int8_skip_modules=['img_in', 'txt_in', 'proj_out', 'norm_out',
                                               'time_text_embed', 'transformer_blocks.0.img_mod']))
def follow(m, a, k):                                   # a block on GPU 1 pulls its inputs over (and GPU 0 parts pull back)
    d = next(m.parameters()).device
    mv = lambda x: x.to(d) if torch.is_tensor(x) else type(x)(mv(v) for v in x) if isinstance(x, (tuple, list)) else x
    return tuple(mv(x) for x in a), {n: mv(v) for n, v in k.items()}
for i, b in enumerate(tr.transformer_blocks):         # second half of the blocks to GPU 1: room for attention on both
    if i >= len(tr.transformer_blocks) // 2: b.to('cuda:1')
    b.register_forward_pre_hook(follow, with_kwargs=True)
for m in (tr.norm_out, tr.proj_out): m.register_forward_pre_hook(follow, with_kwargs=True)
torch.cuda.empty_cache()
sched = FlowMatchEulerDiscreteScheduler.from_config(dict(base_image_seq_len=256, base_shift=math.log(3), invert_sigmas=False,
        max_image_seq_len=8192, max_shift=math.log(3), num_train_timesteps=1000, shift=1.0, shift_terminal=None,
        stochastic_sampling=False, time_shift_type='exponential', use_beta_sigmas=False, use_dynamic_shifting=True,
        use_exponential_sigmas=False, use_karras_sigmas=False))
pipe = QwenImageEditPlusPipeline.from_pretrained(R, transformer=tr, text_encoder=None, scheduler=sched, torch_dtype=BF)
pipe.load_lora_weights('lightx2v/Qwen-Image-Lightning',
        weight_name='Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-8steps-V1.0-bf16.safetensors')
type(pipe)._execution_device = property(lambda self: torch.device('cuda:0'))
pipe.vae.to('cuda:1', torch.float32); pipe.vae.enable_tiling()   # VAE in fp32 on GPU 1 (encodes references, decodes)
_enc, _dec = pipe._encode_vae_image, pipe.vae.decode
pipe._encode_vae_image = lambda image, generator: _enc(image.to('cuda:1', torch.float32), generator).to('cuda:0', BF)
pipe.vae.decode = lambda z, *a, **k: _dec(z.to('cuda:1', torch.float32), *a, **k)
print(f'loaded in {time.time() - t:.0f} s', flush=True)
for j in JOBS:
    if j['name'] not in embeds: continue
    t = time.time()
    try:
        pe, pm = embeds[j['name']]; ims = refs[j['name']]
        EP.VAE_IMAGE_SIZE = 640 * 640 // max(1, len(ims))   # attention is quadratic: the references share 0.4 MP
        args = dict(prompt_embeds=pe.to('cuda:0'), prompt_embeds_mask=pm.to('cuda:0') if pm is not None else None,
                    width=j['w'], height=j['h'], num_inference_steps=8, true_cfg_scale=1.0,
                    generator=torch.Generator('cpu').manual_seed(int(j.get('seed', 7))))
        if ims: args['image'] = ims
        img = pipe(**args).images[0]
        img.convert('RGB').save(f"/kaggle/working/out/{j['name']}.jpg", quality=94)
        print('made', j['name'], f'{time.time() - t:.0f} s', flush=True)
    except Exception as e:
        import traceback; traceback.print_exc()
        print('failed', j['name'], str(e)[:300], flush=True)
    torch.cuda.empty_cache()
'''

CLIPS = r'''
import json, os, subprocess, sys, time
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'git+https://github.com/huggingface/diffusers',
                'transformers', 'accelerate', 'ftfy', 'imageio', 'imageio-ffmpeg'], check=True)
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
import glob, torch
from PIL import Image
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline, WanPipeline
from diffusers.utils import export_to_video
from transformers import UMT5EncoderModel
JOBS = json.loads(%r)
def find(f):
    """An uploaded picture, wherever Kaggle mounted the dataset."""
    hits = glob.glob('/kaggle/input/**/' + f, recursive=True)
    if not hits: raise FileNotFoundError(f + ' not in ' + str(glob.glob('/kaggle/input/**', recursive=True)[:20]))
    return hits[0]
os.makedirs('/kaggle/working/out', exist_ok=True)
R = 'Wan-AI/Wan2.2-TI2V-5B-Diffusers'; FP = torch.float16; t = time.time()
NEG = ('bright colors, overexposed, static, blurred details, subtitles, style, painting, still picture, gray, worst quality, '
       'low quality, JPEG artifacts, ugly, deformed, extra fingers, bad hands, bad face, fused fingers, frozen frame, '
       'cluttered background, three legs, cartoon, 3d render, cgi')
# two passes, like the keyframes: 1) umT5 (11 GB, bf16 since it overflows in fp16) reads every prompt and is freed,
# 2) the fp16 transformer gets GPU 1 to itself and the VAE GPU 0 (fp16 attention on a T4 uses the memory-efficient kernel)
te = UMT5EncoderModel.from_pretrained(R, subfolder='text_encoder', torch_dtype=torch.bfloat16).to('cuda:0')
vae = AutoencoderKLWan.from_pretrained(R, subfolder='vae', torch_dtype=torch.float32)
i2v = WanImageToVideoPipeline.from_pretrained(R, vae=vae, text_encoder=te, transformer=None, torch_dtype=FP)
embeds = {}
for j in JOBS:
    with torch.no_grad():
        pe, ne = i2v.encode_prompt(prompt=j['prompt'], negative_prompt=NEG, device='cuda:0')
    embeds[j['name']] = (pe.to('cpu', FP), ne.to('cpu', FP))
tok = i2v.tokenizer
del i2v, te; import gc; gc.collect(); torch.cuda.empty_cache()
print(f'prompts encoded in {time.time() - t:.0f} s', flush=True)
i2v = WanImageToVideoPipeline.from_pretrained(R, vae=vae, text_encoder=None, tokenizer=tok, torch_dtype=FP)
i2v.vae.to('cuda:0'); i2v.vae.enable_tiling(); i2v.transformer.to('cuda:1')
type(i2v)._execution_device = property(lambda self: torch.device('cuda:0'))
def mv(x, d):
    if torch.is_tensor(x): return x.to(d)
    if isinstance(x, (tuple, list)): return type(x)(mv(v, d) for v in x)
    if isinstance(x, dict): return {k: mv(v, d) for k, v in x.items()}
    return x
_fwd = i2v.transformer.forward                         # the pipeline works on GPU 0; each step runs on GPU 1
i2v.transformer.forward = lambda *a, **k: mv(_fwd(*mv(a, 'cuda:1'), **mv(k, 'cuda:1')), 'cuda:0')
print(f'loaded in {time.time() - t:.0f} s', flush=True)
for j in JOBS:
    t = time.time()
    try:
        pe, ne = embeds[j['name']]
        img = Image.open(find(j['name'] + '.jpg')).convert('RGB').resize((j['w'], j['h']), Image.LANCZOS)
        frames = int(round(j['secs'] * 24 / 4)) * 4 + 1
        out = i2v(image=img, prompt_embeds=pe.to('cuda:0'), negative_prompt_embeds=ne.to('cuda:0'), height=j['h'],
                  width=j['w'], num_frames=frames, guidance_scale=5.0, num_inference_steps=j.get('steps', 30),
                  generator=torch.Generator('cpu').manual_seed(int(j.get('seed', 11)))).frames[0]
        export_to_video(out, f"/kaggle/working/out/{j['name']}.mp4", fps=24)
        print('made', j['name'], f'{frames} frames {time.time() - t:.0f} s', flush=True)
    except Exception as e:
        import traceback; traceback.print_exc()
        print('failed', j['name'], str(e)[:300], flush=True)
    torch.cuda.empty_cache()
'''

CLIPS14 = r'''
import json, os, subprocess, sys, time
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'git+https://github.com/huggingface/diffusers',
                'transformers', 'accelerate', 'peft', 'gguf', 'ftfy', 'imageio', 'imageio-ffmpeg'], check=True)
# Kaggle ships torchao 0.10; peft refuses LoRA on anything once it sees a torchao older than 0.16 (that killed Lightning on
# the 2026-10-28 runs: 20 slow steps, 54 min for a 3 s clip). peft does not need torchao at all, so take it out.
subprocess.run([sys.executable, '-m', 'pip', 'uninstall', '-y', '-q', 'torchao'])
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
import gc, glob, torch, builtins
T0 = time.time(); DEADLINE = 75 * 60                    # stop starting new clips after 75 min so the log always comes back
os.makedirs('/kaggle/working/out', exist_ok=True)
_print = builtins.print
def print(*a, **k):                                      # everything also goes to out/run14.txt (downloaded with the clips)
    _print(*a, **k); open('/kaggle/working/out/run14.txt', 'a').write(f'[{time.time() - T0:6.0f}s] ' + ' '.join(map(str, a)) + chr(10))
from PIL import Image
from huggingface_hub import hf_hub_download, list_repo_files
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline, WanTransformer3DModel, GGUFQuantizationConfig
from diffusers.utils import export_to_video
from transformers import UMT5EncoderModel
JOBS = json.loads(%r)
def find(f):
    hits = glob.glob('/kaggle/input/**/' + f, recursive=True)
    if not hits: raise FileNotFoundError(f)
    return hits[0]
def pick(repo, *words):
    hits = [f for f in list_repo_files(repo) if all(w.lower() in f.lower() for w in words)]
    print(repo, words, '->', hits[:3], flush=True); return hf_hub_download(repo, sorted(hits)[0])
os.makedirs('/kaggle/working/out', exist_ok=True)
# Wan2.2 I2V A14B (two 14B experts: high noise = transformer, low noise = transformer_2) as 4-bit GGUF, one per T4,
# with the Lightning 4-step LoRAs so a 5 s clip takes minutes. Falls back to 20 plain steps if the LoRA will not load.
R = 'Wan-AI/Wan2.2-I2V-A14B-Diffusers'; G = 'QuantStack/Wan2.2-I2V-A14B-GGUF'; FP = torch.float16; t = time.time()
te = UMT5EncoderModel.from_pretrained(R, subfolder='text_encoder', torch_dtype=torch.bfloat16).to('cuda:0')
i2v = WanImageToVideoPipeline.from_pretrained(R, text_encoder=te, transformer=None, transformer_2=None, vae=None, torch_dtype=FP)
embeds = {}
for j in JOBS:
    with torch.no_grad():
        pe, ne = i2v.encode_prompt(prompt=j['prompt'], negative_prompt='', device='cuda:0')
    embeds[j['name']] = (pe.to('cpu', FP), ne.to('cpu', FP))
tok = i2v.tokenizer; del i2v, te; gc.collect(); torch.cuda.empty_cache()
print('te done; RAM:', ' '.join(os.popen('free -g').read().split()[7:10])); print(f'prompts encoded in {time.time() - t:.0f} s', flush=True)
q = GGUFQuantizationConfig(compute_dtype=FP)
t1 = WanTransformer3DModel.from_single_file(pick(G, 'high', 'q4_k_m', '.gguf'), quantization_config=q, config=R,
                                            subfolder='transformer', torch_dtype=FP)
t2 = WanTransformer3DModel.from_single_file(pick(G, 'low', 'q4_k_m', '.gguf'), quantization_config=q, config=R,
                                            subfolder='transformer_2', torch_dtype=FP)
vae = AutoencoderKLWan.from_pretrained(R, subfolder='vae', torch_dtype=torch.float32)
i2v = WanImageToVideoPipeline.from_pretrained(R, vae=vae, transformer=t1, transformer_2=t2, text_encoder=None,
                                              tokenizer=tok, torch_dtype=FP)
FAST = True
try:
    L = 'lightx2v/Wan2.2-Lightning'
    hi = [f for f in list_repo_files(L) if 'I2V' in f and '4steps' in f and 'high_noise' in f and f.endswith('.safetensors')]
    lo = [f for f in list_repo_files(L) if 'I2V' in f and '4steps' in f and 'low_noise' in f and f.endswith('.safetensors')]
    print('lightning', hi[:1], lo[:1], flush=True)
    i2v.load_lora_weights(L, weight_name=sorted(hi)[-1], adapter_name='light')
    i2v.load_lora_weights(L, weight_name=sorted(lo)[-1], adapter_name='light_2', load_into_transformer_2=True)
except Exception as e:
    import traceback; print('LIGHTNING FAILED:', traceback.format_exc()[-1500:]); FAST = False
i2v.vae.to('cuda:0'); i2v.vae.enable_tiling(); t1.to('cuda:1'); t2.to('cuda:0')
type(i2v)._execution_device = property(lambda self: torch.device('cuda:0'))
def mv(x, d):
    if torch.is_tensor(x): return x.to(d)
    if isinstance(x, (tuple, list)): return type(x)(mv(v, d) for v in x)
    if isinstance(x, dict): return {k: mv(v, d) for k, v in x.items()}
    return x
_f1 = t1.forward
t1.forward = lambda *a, **k: mv(_f1(*mv(a, 'cuda:1'), **mv(k, 'cuda:1')), 'cuda:0')
print(f'loaded in {time.time() - t:.0f} s, fast={FAST}', flush=True)
def step_cb(pipe, i, ts, kw):
    print(f'  step {i} t={int(ts)} {time.time() - T0:.0f}s, gpu0 {torch.cuda.max_memory_allocated(0) >> 30} GB, gpu1 {torch.cuda.max_memory_allocated(1) >> 30} GB')
    return kw
for j in JOBS:
    if time.time() - T0 > DEADLINE: print('deadline: skipped', j['name']); continue
    t = time.time()
    try:
        pe, ne = embeds[j['name']]
        img = Image.open(find(j['name'] + '.jpg')).convert('RGB').resize((j['w'], j['h']), Image.LANCZOS)
        frames = int(round(j['secs'] * 16 / 4)) * 4 + 1
        kw = dict(num_inference_steps=4, guidance_scale=1.0, guidance_scale_2=1.0) if FAST else \
             dict(num_inference_steps=20, guidance_scale=3.5, guidance_scale_2=3.5, negative_prompt_embeds=ne.to('cuda:0'))
        out = i2v(image=img, prompt_embeds=pe.to('cuda:0'), height=j['h'], width=j['w'], num_frames=frames,
                  generator=torch.Generator('cpu').manual_seed(int(j.get('seed', 11))), callback_on_step_end=step_cb, **kw).frames[0]
        export_to_video(out, f"/kaggle/working/out/{j['name']}.mp4", fps=16)
        print('made', j['name'], f'{frames} frames {time.time() - t:.0f} s', flush=True)
    except Exception as e:
        import traceback; traceback.print_exc()
        print('failed', j['name'], str(e)[:300], flush=True)
    torch.cuda.empty_cache()
'''

MESH = r'''
import glob, json, os, subprocess, sys, time, traceback
T0 = time.time(); os.makedirs('/kaggle/working/out', exist_ok=True)
def log(*a):
    m = f'[{time.time() - T0:5.0f}s] ' + ' '.join(map(str, a)); print(m, flush=True); open('/kaggle/working/out/mesh.txt', 'a').write(m + chr(10))
JOBS = json.loads(%r)
# Hunyuan3D-2 (Tencent, image -> textured mesh): shape on one T4, then texture painting (needs its two CUDA extensions built)
sh = lambda c: subprocess.run(c, shell=True, capture_output=True, text=True)
r = sh('git clone -q https://github.com/Tencent/Hunyuan3D-2 /tmp/h3d && cd /tmp/h3d && pip install -q -r requirements.txt && pip install -q -e .')
log('install', r.returncode, r.stderr[-500:])
tex_ok = True
for ext in ('hy3dgen/texgen/custom_rasterizer', 'hy3dgen/texgen/differentiable_renderer'):
    r = sh(f'cd /tmp/h3d/{ext} && python setup.py install'); log('build', ext, r.returncode, r.stderr[-300:]); tex_ok &= r.returncode == 0
sys.path.insert(0, '/tmp/h3d')
from PIL import Image
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2'); log('shape model loaded')
for j in JOBS:
    try:
        img = Image.open(glob.glob('/kaggle/input/**/' + j['image'], recursive=True)[0]).convert('RGBA')
        img = BackgroundRemover()(img.convert('RGB')); img.save(f"/kaggle/working/out/{j['name']}_cut.png")
        mesh = shape(image=img, num_inference_steps=30, octree_resolution=380)[0]
        mesh.export(f"/kaggle/working/out/{j['name']}_shape.glb"); log('shape done', j['name'])
        if tex_ok:
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2'); log('paint model loaded')
            mesh = paint(mesh, image=img); mesh.export(f"/kaggle/working/out/{j['name']}.glb"); log('textured done', j['name'])
    except Exception:
        log('FAILED', j['name'], traceback.format_exc()[-1500:])
'''


def upload(folder, slug='ml-input'):
    """Pictures the kernel reads (keyframes) as a private Kaggle dataset, new version each time."""
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, 'keys'))
        for f in os.listdir(folder):
            if f.endswith('.jpg'): shutil.copy(os.path.join(folder, f), os.path.join(d, 'keys', f))
        json.dump(dict(title=slug, id=f'{USER}/{slug}', licenses=[dict(name='CC0-1.0')]),
                  open(os.path.join(d, 'dataset-metadata.json'), 'w'))
        r = subprocess.run(['kaggle', 'datasets', 'version', '-p', d, '-m', 'keys', '--dir-mode', 'zip'], capture_output=True, text=True)
        if r.returncode or 'error' in ((r.stdout or '') + (r.stderr or '')).lower():
            r = subprocess.run(['kaggle', 'datasets', 'create', '-p', d, '--dir-mode', 'zip'], capture_output=True, text=True)
        print(((r.stdout or '') + (r.stderr or '')).strip()[-300:], flush=True)
    for _ in range(40):                                                     # wait until it is ready to mount
        s = subprocess.run(['kaggle', 'datasets', 'status', f'{USER}/{slug}'], capture_output=True, text=True).stdout
        if 'ready' in s.lower(): return
        time.sleep(15)


def kaggle(*a, check=True):
    r = subprocess.run(['kaggle', *a], capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError((r.stdout or '') + (r.stderr or ''))
    return r.stdout


def run(kind, jobs, out, slug=None, keys=None, wait=True):
    slug = slug or f'ml-{kind}'; os.makedirs(out, exist_ok=True)
    code = {'stills': STILLS, 'keys': KEYS, 'clips': CLIPS, 'clips14': CLIPS14, 'mesh': MESH}[kind] % json.dumps(jobs)
    if keys: upload(keys)
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, 'run.py'), 'w', encoding='utf8').write(code)
        json.dump(dict(id=f'{USER}/{slug}', title=slug, code_file='run.py', language='python', kernel_type='script',
                       is_private=True, enable_gpu=True, enable_internet=True, machine_shape='NvidiaTeslaT4',
                       dataset_sources=[f'{USER}/ml-input'] if keys else [], competition_sources=[], kernel_sources=[]),
                  open(os.path.join(d, 'kernel-metadata.json'), 'w'))
        print(kaggle('kernels', 'push', '-p', d).strip(), flush=True)
    if not wait: return None
    return fetch(slug, out, poll=True)


def fetch(slug, out, poll=False):
    """Download a kernel's outputs into out (waits for it first with poll). True if it completed."""
    os.makedirs(out, exist_ok=True); time.sleep(20 if poll else 0); last = ''
    while True:
        s = kaggle('kernels', 'status', f'{USER}/{slug}', check=False)
        if s != last: print(s.strip(), flush=True); last = s
        if any(k in s.lower() for k in ('complete', 'error', 'cancel')) or not poll: break
        time.sleep(30)
    if not any(k in last.lower() for k in ('complete', 'error', 'cancel')): return None
    with tempfile.TemporaryDirectory() as d:
        kaggle('kernels', 'output', f'{USER}/{slug}', '-p', d, check=False)
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.jpg', '.mp4', '.png', '.txt', '.glb')): shutil.copy(os.path.join(root, f), os.path.join(out, f))
                elif f.endswith('.log'):
                    try: log = ''.join(x.get('data', '') for x in json.load(open(os.path.join(root, f), encoding='utf8')))
                    except Exception: log = open(os.path.join(root, f), encoding='utf8', errors='replace').read()
                    open(os.path.join(out, f'{slug}.log'), 'w', encoding='utf8').write(log)
                    print('\n'.join(l for l in log.splitlines() if l.startswith(('made', 'failed', 'loaded', 'Traceback'))
                                    or 'Error' in l)[-3000:], flush=True)
    return 'complete' in last.lower()


if __name__ == '__main__':
    if sys.argv[1] == 'fetch': print(fetch(sys.argv[2], sys.argv[3]))     # python kaggle_run.py fetch ml-clips14 <out>
    else: run(sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], keys=sys.argv[4] if len(sys.argv) > 4 else None)
