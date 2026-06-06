from PIL import Image, ImageDraw
import math

S = 1024
img = Image.new("RGBA", (S, S), (0,0,0,0))

# --- rounded-square background with vertical blue gradient ---
grad = Image.new("RGBA", (S, S), (0,0,0,0))
top = (37, 110, 196)      # brand blue #256ec4-ish
bot = (14, 54, 110)       # deep navy
for y in range(S):
    t = y / (S-1)
    r = int(top[0]*(1-t) + bot[0]*t)
    g = int(top[1]*(1-t) + bot[1]*t)
    b = int(top[2]*(1-t) + bot[2]*t)
    for_row = Image.new("RGBA", (S,1), (r,g,b,255))
    grad.paste(for_row, (0,y))

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
radius = 230
md.rounded_rectangle([0,0,S-1,S-1], radius=radius, fill=255)
img.paste(grad, (0,0), mask)

d = ImageDraw.Draw(img)

# subtle top sheen
sheen = Image.new("RGBA",(S,S),(0,0,0,0))
sd = ImageDraw.Draw(sheen)
sd.rounded_rectangle([0,0,S-1,int(S*0.5)], radius=radius, fill=(255,255,255,18))
img.alpha_composite(Image.composite(sheen, Image.new("RGBA",(S,S),(0,0,0,0)), mask))

# --- house glyph (white) ---
cx = 512
roof_apex = (cx, 360)
roof_left = (300, 560)
roof_right = (724, 560)
# roof
d.polygon([roof_apex, roof_left, roof_right], fill=(255,255,255,255))
# eaves overhang accent
d.line([roof_left, roof_right], fill=(255,255,255,255), width=8)
# body
body = [360, 545, 664, 760]
d.rounded_rectangle(body, radius=26, fill=(255,255,255,255))
# door (cut out via blue)
d.rounded_rectangle([474, 628, 550, 760], radius=14, fill=(31, 86, 150, 255))
# window
d.rounded_rectangle([402, 600, 462, 660], radius=10, fill=(31, 86, 150, 255))

# --- call/chat accent bubble (amber) top-right ---
bx0, by0, bx1, by1 = 596, 300, 760, 430
d.rounded_rectangle([bx0,by0,bx1,by1], radius=44, fill=(227, 173, 79, 255))
# bubble tail
d.polygon([(640,420),(640,470),(686,420)], fill=(227,173,79,255))
# three dots
for i,xx in enumerate([638, 678, 718]):
    d.ellipse([xx-12, 357, xx+12, 381], fill=(31,86,150,255))

img.save("icon.png")
img.resize((512,512), Image.LANCZOS).save("icon_512.png")

# ICO (Windows)
img.save("icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

# ICNS (Mac) — try Pillow
icns_ok = False
try:
    img.save("icon.icns")
    icns_ok = True
except Exception as e:
    print("Pillow icns failed:", e)

print("PNG/ICO done. ICNS via Pillow:", icns_ok)
