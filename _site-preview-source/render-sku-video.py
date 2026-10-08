"""Reproducible original SKU Bridge motion graphic; Pillow + ffmpeg, no stock assets."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import subprocess, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'site-preview/assets/media'
OUT.mkdir(exist_ok=True,parents=True)
W,H,FPS=960,540,15
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
fonts={s:ImageFont.truetype(FONT,s) for s in [12,13,14,16,18,20,24]}
bold={s:ImageFont.truetype(BOLD,s) for s in [14,16,18,20,23,30,34,38]}
navy='#0b263e'; mint='#69e0ce'; muted='#a7becd'; white='#f5f9fb'
scenes=[
(['One file.','Too many formats.'],'Bring your Excel or CSV product list.','01 / BRING YOUR FILE'),
(['Catch the issues.','Before import.'],'Find duplicates and missing information.','02 / MAP & CHECK'),
(['Review. Correct.','Stay in control.'],'Approve the rows you trust.','03 / REVIEW & APPROVE'),
(['Cleaner data.','A clearer next step.'],'Export, then check your destination template.','04 / EXPORT & VERIFY')]
p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'sku-bridge-intro.mp4')],stdin=subprocess.PIPE)
for frame in range(24*FPS):
 t=frame/FPS; scene=min(3,int(t//6)); local=t%6; ease=min(1,local/0.6); ease=1-(1-ease)**3
 im=Image.new('RGB',(W,H),navy); d=ImageDraw.Draw(im)
 for yy in range(H):
  c=tuple(int(a+(b-a)*yy/H) for a,b in zip((7,28,47),(15,47,66)));d.line((0,yy,W,yy),fill=c)
 for xx in range(0,W,48): d.line((xx,95,xx,H),fill='#13394f')
 for yy in range(100,H,48): d.line((0,yy,W,yy),fill='#13394f')
 d.rounded_rectangle((37,31,65,59),7,fill=mint)
 d.text((77,30),'Hamvara',font=bold[20],fill=white)
 d.text((37,84),'SKU BRIDGE',font=bold[16],fill=mint)
 d.text((630,38),'PRODUCT DATA, UNDER CONTROL',font=fonts[12],fill=muted)
 offset=int(18*(1-ease)); headline,sub,kicker=scenes[scene]
 d.text((38,160+offset),kicker,font=bold[14],fill=mint)
 for i,line in enumerate(headline):d.text((36,198+i*49+offset),line,font=bold[34],fill=white)
 # Wrap the short descriptor deliberately to preserve readability.
 texts=[['Bring your Excel or CSV','product list.'],['Find duplicates and','missing information.'],['Approve the rows','you trust.'],['Export, then check your','destination template.']][scene]
 for i,line in enumerate(texts):d.text((38,326+i*28),line,font=fonts[18],fill=muted)
 d.rounded_rectangle((38,412,305,455),9,fill=mint if scene==3 else '#204559')
 d.text((55,423),'Explore SKU Bridge  →' if scene==3 else 'IMPORT → REVIEW → EXPORT',font=bold[14],fill=navy if scene==3 else mint)
 x=460+int(20*(1-ease)); y=137
 d.rounded_rectangle((x,y,923,455),15,fill='#f4f8fa',outline='#527082',width=1)
 d.rounded_rectangle((x+17,y+16,x+49,y+48),7,fill='#dcefed')
 d.text((x+24,y+21),'B',font=bold[18],fill='#087f8c')
 d.text((x+62,y+17),'Product file review',font=bold[16],fill=navy)
 d.text((x+62,y+40),'Illustrative launch workflow',font=fonts[12],fill='#5a7280')
 d.line((x+18,y+68,905,y+68),fill='#ccdde4')
 if scene<3:
  d.text((x+25,y+86),'SKU',font=bold[14],fill='#5a7280');d.text((x+183,y+86),'STOCK',font=bold[14],fill='#5a7280');d.text((x+294,y+86),'REVIEW',font=bold[14],fill='#5a7280')
  rows=[('RAW-100','1,250'),('PKG-020','200'),('FG-001','24'),('raw-100','45')]
  for i,(code,qty) in enumerate(rows):
   yy=y+116+i*38; conflict=i in [0,3] and scene in [1,2]
   if scene==2 and local>2.6: conflict=False;code='RAW-101' if i==3 else code
   bg='#fff1d8' if conflict else '#fff'
   d.rounded_rectangle((x+17,yy,x+443,yy+32),4,fill=bg)
   d.text((x+25,yy+8),code,font=fonts[13],fill=navy);d.text((x+183,yy+8),qty,font=fonts[13],fill=navy)
   state=('Check' if conflict else 'Ready') if scene else 'Imported'
   d.text((x+294,yy+8),state,font=bold[14],fill='#a05a16' if conflict else '#087f70')
  label='Columns mapped • Review before export' if scene else 'Excel / CSV • Keep your original file'
  d.text((x+20,y+286),label,font=fonts[13],fill='#526f7e')
 else:
  d.ellipse((x+182,y+90,x+260,y+168),fill='#d9f2ea')
  d.line((x+203,y+129,x+216,y+142,x+241,y+114),fill='#078163',width=5)
  d.text((x+82,y+184),'Reviewed file, ready to export',font=bold[18],fill=navy)
  d.rounded_rectangle((x+83,y+229,x+196,y+268),7,fill='#087f8c');d.text((x+102,y+240),'EXCEL',font=bold[16],fill=white)
  d.rounded_rectangle((x+239,y+229,x+354,y+268),7,fill='#087f8c');d.text((x+274,y+240),'CSV',font=bold[16],fill=white)
  d.text((x+62,y+287),'Verify fields against your ERP template.',font=fonts[14],fill='#526f7e')
 for i,label in enumerate(['IMPORT','MAP','REVIEW','EXPORT']):
  xx=38+i*223;d.rounded_rectangle((xx,495,xx+203,499),2,fill='#294b61')
  progress=1 if i<scene else min(1,local/6) if i==scene else 0
  if progress:d.rounded_rectangle((xx,495,xx+int(203*progress),499),2,fill=mint)
  d.text((xx,508),label,font=fonts[12],fill=mint if i==scene else muted)
 if frame==0:im.save(OUT/'sku-bridge-poster.jpg',quality=90)
 p.stdin.write(im.tobytes())
p.stdin.close()
if p.wait():raise SystemExit('ffmpeg failed')
print('Created 24-second H.264 video and poster.')
