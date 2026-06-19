import sys
from PIL import Image, ImageDraw

def make_rounded(img_path, output_path, crop_box=(51, 46, 1198, 1193), radius_ratio=0.22):
    im = Image.open(img_path).convert("RGBA")
    
    # First crop the image to the exact boundaries of the dark rounded square
    # to eliminate the outer black padding.
    im_cropped = im.crop(crop_box)
    
    w, h = im_cropped.size
    
    # Create a mask image
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    
    # Proportional corner radius (22% matches typical iOS/Android squircle)
    rad = int(min(w, h) * radius_ratio)
    draw.rounded_rectangle((0, 0, w, h), radius=rad, fill=255)
    
    # Apply mask as alpha channel
    im_cropped.putalpha(mask)
    
    # Save the processed image
    im_cropped.save(output_path, "PNG")
    print(f"Successfully cropped to {im_cropped.size} and rounded image at {output_path} with radius {rad}")

if __name__ == "__main__":
    make_rounded("newicons/newmainicon.png", "public/icons/newmainicon.png")
