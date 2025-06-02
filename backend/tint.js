async function tintPngIcon(src, color, size = 64) {
  const img = new Image();
  img.src = src;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Draw the image normally
  ctx.drawImage(img, 0, 0, size, size);

  // Extract the image data
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  // Convert CSS color to RGB
  const temp = document.createElement("div");
  temp.style.color = color;
  document.body.appendChild(temp);
  const rgb = getComputedStyle(temp).color.match(/\d+/g).map(Number);
  document.body.removeChild(temp);

  // Tint each pixel while preserving alpha
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > 0) {
      data[i] = rgb[0]; // R
      data[i + 1] = rgb[1]; // G
      data[i + 2] = rgb[2]; // B
      // Alpha remains unchanged
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const finalData = ctx.getImageData(0, 0, size, size);

  // Set the browser action icon
  browser.browserAction.setIcon({
    imageData: {
      [size]: finalData
    }
  });
}

async function updateThemedIcon() {
  const theme = await browser.theme.getCurrent();
  const color = theme.colors?.icons || theme.colors?.toolbar_text;
  if (color) {
    await tintPngIcon("icons/light64.png", color);
  }
}

// Initial icon update
(async () => {
  await updateThemedIcon();
})();

// Reapply icon when theme changes
browser.theme.onUpdated.addListener(updateThemedIcon);
