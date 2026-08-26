#!/usr/bin/env python3
"""Fit the model footprint to the title plan and render an overlay to prove it.

Run against the title-plan image. Reports the best rotation/scale/translation by
maximising IoU between the model's own ground footprint and the building tint,
disambiguates the near-symmetric 180-degree ambiguity using 79a's position, then
writes overlay.png: red = model footprint, blue = derived boundary. The red is the
test — the blue is a round-trip through the transform and always matches.

Requires: pillow, numpy, scipy.
"""
from PIL import Image, ImageDraw
import numpy as np, math, json
from scipy import ndimage
SRC='/root/.claude/uploads/97fc884a-3aa0-54dc-b3ce-a400e85a6969/741dbf7c-image.png'
A=np.array(Image.open(SRC).convert('RGB')).astype(int); H,W,_=A.shape
R,G,B=A[:,:,0],A[:,:,1],A[:,:,2]
near=lambda c,t=16:(abs(R-c[0])<t)&(abs(G-c[1])<t)&(abs(B-c[2])<t)
def big(m,k=9):
    m=ndimage.binary_fill_holes(ndimage.binary_closing(m,np.ones((k,k))))
    lab,n=ndimage.label(m)
    return m if n==0 else lab==int(np.argmax(ndimage.sum(m,lab,range(1,n+1))))+1
line=(G>170)&(G-R>55)&(G-B>55)
bmask=big(near((193,213,183))); plot=big(near((214,244,222))|line|bmask,11)

# 79a = the tan block that ADJOINS the plot, not merely the biggest one.
tan=ndimage.binary_fill_holes(ndimage.binary_closing(near((213,203,183)),np.ones((7,7))))
lab,n=ndimage.label(tan)
grown=ndimage.binary_dilation(plot,np.ones((3,3)),iterations=12)
cands=[]
for i in range(1,n+1):
    comp=lab==i
    if comp.sum()<3000: continue
    cands.append((( comp&grown).sum(), comp.sum(), i))
cands.sort(reverse=True)
a79=lab==cands[0][2]
print(f'79a component: {cands[0][1]} px, {cands[0][0]} px adjoining the plot ({len(cands)} candidates)')

RECTS=[(0,0,4.10,7.26),(0,0,9.74,5.59),(9.74,0.30,16.36,6.48)]
MA=4.10*7.26+(9.74-4.10)*5.59+(16.36-9.74)*6.18
def raster(th,s,tx,ty,mir):
    img=Image.new('1',(W,H),0); dr=ImageDraw.Draw(img); c,sn=math.cos(th),math.sin(th)
    for (x0,y0,x1,y1) in RECTS:
        pts=[]
        for mx,my in ((x0,y0),(x1,y0),(x1,y1),(x0,y1)):
            yy=7.26-my if mir else my
            pts.append(((mx*c-yy*sn)*s+tx,(mx*sn+yy*c)*s+ty))
        dr.polygon(pts,fill=1)
    return np.array(img,dtype=bool)
iou=lambda th,s,tx,ty,mir:(lambda m:(m&bmask).sum()/((m|bmask).sum() or 1))(raster(th,s,tx,ty,mir))
ys,xs=np.nonzero(bmask); cx_t,cy_t=xs.mean(),ys.mean(); s0=math.sqrt(bmask.sum()/MA)
gx,gy=np.meshgrid(np.linspace(0,16.36,300),np.linspace(0,7.26,140))
ins=np.zeros_like(gx,bool)
for (x0,y0,x1,y1) in RECTS: ins|=(gx>=x0)&(gx<=x1)&(gy>=y0)&(gy<=y1)
mcx,mcy=gx[ins].mean(),gy[ins].mean()
ay,ax=np.nonzero(a79)

def refine(deg,mir):
    cy_m=7.26-mcy if mir else mcy
    c,sn=math.cos(math.radians(deg)),math.sin(math.radians(deg))
    tx=cx_t-(mcx*c-cy_m*sn)*s0; ty=cy_t-(mcx*sn+cy_m*c)*s0; s=s0
    v=iou(math.radians(deg),s,tx,ty,mir)
    for dd,ds,dt in [(1.5,0.8,5),(0.6,0.35,2),(0.2,0.12,1),(0.08,0.05,0.5)]:
        imp=True
        while imp:
            imp=False
            for a_,b_,cc,e in [(dd,0,0,0),(-dd,0,0,0),(0,ds,0,0),(0,-ds,0,0),
                               (0,0,dt,0),(0,0,-dt,0),(0,0,0,dt),(0,0,0,-dt)]:
                nv=iou(math.radians(deg+a_),s+b_,tx+cc,ty+e,mir)
                if nv>v: v,deg,s,tx,ty=nv,deg+a_,s+b_,tx+cc,ty+e; imp=True
    c,sn=math.cos(math.radians(deg)),math.sin(math.radians(deg))
    u=(ax[::41]-tx)/s; w=(ay[::41]-ty)/s
    mx=float((u*c+w*sn).mean()); my=float((-u*sn+w*c).mean())
    if mir: my=7.26-my
    return dict(iou=v,deg=deg,scale=s,tx=tx,ty=ty,mirror=mir,a79x=mx,a79y=my)

res=[refine(d,m) for m in (False,True) for d in (140,320)]
for r in res:
    print(f"  mirror={str(r['mirror']):5s} rot {r['deg']:7.2f}  IoU {r['iou']:.3f}  79a at ({r['a79x']:+6.1f},{r['a79y']:+5.1f})")
ok=[r for r in res if r['a79x'] < 0]
pick=max(ok,key=lambda r:r['iou']) if ok else max(res,key=lambda r:r['iou'])
print(f"\nCHOSEN mirror={pick['mirror']} rot {pick['deg']:.2f} IoU {pick['iou']:.3f} scale {pick['scale']:.2f} px/m")
json.dump(pick,open('fit.json','w'))
np.save('plot.npy',plot); np.save('bmask.npy',bmask); np.save('a79.npy',a79)
from PIL import Image, ImageDraw
import numpy as np, math, json
SRC='/root/.claude/uploads/97fc884a-3aa0-54dc-b3ce-a400e85a6969/741dbf7c-image.png'
F=json.load(open('fit.json'))
th,s,tx,ty,mir = math.radians(F['deg']),F['scale'],F['tx'],F['ty'],F['mirror']
c,sn=math.cos(th),math.sin(th)
def to_m(px,py):
    u,v=(px-tx)/s,(py-ty)/s
    mx=u*c+v*sn; yy=-u*sn+v*c
    return (mx, 7.26-yy if mir else yy)
def to_px(mx,my):
    yy=7.26-my if mir else my
    return ((mx*c-yy*sn)*s+tx,(mx*sn+yy*c)*s+ty)

plot=np.load('plot.npy'); a79=np.load('a79.npy')
true_area=plot.sum()/s**2
def trace(mask):
    ys_,xs_=np.nonzero(mask); y0=int(ys_.min()); x0=int(np.min(xs_[ys_==y0]))
    nb=[(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1),(0,-1),(1,-1)]
    out=[(x0,y0)]; cur=(x0,y0); bd=4
    for _ in range(600000):
        f=False
        for k in range(8):
            dd=(bd+1+k)%8; nx,ny=cur[0]+nb[dd][0],cur[1]+nb[dd][1]
            if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx]:
                bd=(dd+5)%8; cur=(nx,ny); out.append(cur); f=True; break
        if not f: break
        if len(out)>20 and cur==(x0,y0): break
    return out
def rdp(p,eps):
    if len(p)<3: return list(p)
    a0,b0=p[0],p[-1]; den=math.hypot(b0[0]-a0[0],b0[1]-a0[1]); dm,idx=-1,0
    for i in range(1,len(p)-1):
        dd=math.hypot(p[i][0]-a0[0],p[i][1]-a0[1]) if den<1e-9 else \
           abs((b0[0]-a0[0])*(a0[1]-p[i][1])-(a0[0]-p[i][0])*(b0[1]-a0[1]))/den
        if dd>dm: dm,idx=dd,i
    return rdp(p[:idx+1],eps)[:-1]+rdp(p[idx:],eps) if dm>eps else [a0,b0]
shoe=lambda Q: abs(sum(Q[i][0]*Q[(i+1)%len(Q)][1]-Q[(i+1)%len(Q)][0]*Q[i][1] for i in range(len(Q))))/2
Bd=trace(plot); half=len(Bd)//2
S=rdp(Bd[:half+1],18)[:-1]+rdp(Bd[half:],18)[:-1]
P=[[round(v,2) for v in to_m(*p)] for p in S]
if sum(P[i][0]*P[(i+1)%len(P)][1]-P[(i+1)%len(P)][0]*P[i][1] for i in range(len(P)))<0: P=P[::-1]
print(f'plot {len(P)} corners, {shoe(P):.0f} m2 (mask {true_area:.0f} m2)')
xs=[p[0] for p in P]; ys=[p[1] for p in P]
print(f'  x {min(xs):.1f}..{max(xs):.1f}  y {min(ys):.1f}..{max(ys):.1f}   house 0..16.36, 0..7.26')
print(f'  beyond garage {max(xs)-16.36:+.1f}m | front {-min(ys):+.1f}m | rear {max(ys)-7.26:+.1f}m | west {-min(xs):+.1f}m')
ay,ax=np.nonzero(a79); am=[to_m(x,y) for x,y in zip(ax[::31],ay[::31])]
axs=[p[0] for p in am]; ays=[p[1] for p in am]
print(f'  79a x {min(axs):.1f}..{max(axs):.1f}  y {min(ays):.1f}..{max(ays):.1f}  area {a79.sum()/s**2:.0f} m2')
json.dump({'plot':P,'a79':[min(axs),min(ays),max(axs),max(ays)],'fit':F}, open('derived.json','w'))

ov=Image.open(SRC).convert('RGB'); dr=ImageDraw.Draw(ov)
for r in [(0,0,4.10,7.26),(0,0,9.74,5.59),(9.74,0.30,16.36,6.48)]:
    dr.polygon([to_px(*p) for p in ((r[0],r[1]),(r[2],r[1]),(r[2],r[3]),(r[0],r[3]))],
               outline=(255,0,0),width=6)
dr.line([to_px(*p) for p in P]+[to_px(*P[0])],fill=(0,80,255),width=5)
ov.crop((0,940,1320,1940)).save('overlay.png')
print('overlay.png written')
