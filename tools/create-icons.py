from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
# Native brand mark, matching the code-native SVG; no external image assets.
im=Image.new('RGB',(1024,1024),'#f4a99b')
d=ImageDraw.Draw(im)
points=[]
def curve(p0,p1,p2,p3,n=60):
 for i in range(n+1):
  t=i/n;u=1-t
  points.append((2*(u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0]),2*(u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1])))
curve((320,158),(240,95),(140,165),(205,213))
curve((205,213),(229,234),(277,235),(298,256))
curve((298,256),(358,318),(263,407),(163,330))
d.line(points,fill='#352b38',width=80,joint='curve')
for x,y in (points[0],points[-1]):d.ellipse((x-40,y-40,x+40,y+40),fill='#352b38')
d.ellipse((664,670,744,750),fill='#352b38')
for size in (192,512):im.resize((size,size),Image.Resampling.LANCZOS).save(root/f'assets/icon-{size}.png')
