from PIL import Image

def analyze(img_path):
    im = Image.open(img_path)
    print("Format:", im.format, "Size:", im.size, "Mode:", im.mode)
    
    # Let's inspect some pixels around the corners and edges to see the background color.
    # Get bounding box of non-zero pixels
    bbox = im.getbbox()
    print("getbbox():", bbox)
    
    # Let's find the actual dark square boundaries.
    # Since the background is pure black (0, 0, 0, 255) or similar, let's trace from the edges.
    w, h = im.size
    pixels = im.load()
    
    # Left edge
    left = 0
    for x in range(w):
        # check middle column
        r, g, b, *a = pixels[x, h // 2]
        if r > 5 or g > 5 or b > 5: # threshold
            left = x
            break
            
    # Right edge
    right = w
    for x in range(w - 1, -1, -1):
        r, g, b, *a = pixels[x, h // 2]
        if r > 5 or g > 5 or b > 5:
            right = x
            break
            
    # Top edge
    top = 0
    for y in range(h):
        r, g, b, *a = pixels[w // 2, y]
        if r > 5 or g > 5 or b > 5:
            top = y
            break
            
    # Bottom edge
    bottom = h
    for y in range(h - 1, -1, -1):
        r, g, b, *a = pixels[w // 2, y]
        if r > 5 or g > 5 or b > 5:
            bottom = y
            break
            
    print(f"Detected dark square: left={left}, right={right}, top={top}, bottom={bottom}")

if __name__ == "__main__":
    analyze("newicons/newmainicon.png")
