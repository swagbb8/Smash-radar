"""Film finish for AI clips (local, ffmpeg): upscale to 1920x804 scope, gentle sharpen, filmic grade, grain, vignette.
    python finish.py <in.mp4 or folder> <out folder>
"""
import os, subprocess, sys

VF = ('scale=1920:-2:flags=lanczos,crop=1920:804,'                       # 2.39:1 like the Blender 'film' quality
      'unsharp=5:5:0.6:5:5:0.0,'                                          # bring back edge detail lost in the upscale
      'curves=all=0/0 0.12/0.08 0.5/0.48 0.88/0.92 1/0.97,'               # soft S-curve, lifted-free blacks, rolled highlights
      'colorbalance=rs=0.03:bs=-0.04:rh=-0.02:bh=0.03,eq=saturation=0.88,'  # warm shadows, cool highlights, less video-AI colour
      'noise=c0s=7:c0f=t+u,vignette=PI/5')                                # moving film grain, soft vignette


def finish(src, dst):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', VF, '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
                    '-pix_fmt', 'yuv420p', '-an', dst], check=True)


def main():
    src, out = sys.argv[1:3]; os.makedirs(out, exist_ok=True)
    files = [os.path.join(src, f) for f in sorted(os.listdir(src)) if f.endswith('.mp4')] if os.path.isdir(src) else [src]
    for f in files:
        finish(f, os.path.join(out, os.path.basename(f))); print('finished', os.path.basename(f), flush=True)


if __name__ == '__main__':
    main()
