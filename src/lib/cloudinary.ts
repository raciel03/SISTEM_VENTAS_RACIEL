const CLOUD_NAME = 'zongisie';
const UPLOAD_PRESET = 'ml_default';

const compressAndUpload = (blob: Blob, productId: string, quality: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > 800) { height = Math.round(height * 800 / width); width = 800; }
      if (height > 800) { width = Math.round(width * 800 / height); height = 800; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No se pudo crear el canvas')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(async (compressedBlob) => {
        if (!compressedBlob) { reject(new Error('No se pudo comprimir la imagen')); return; }
        const formData = new FormData();
        formData.append('file', compressedBlob, `${productId}.jpg`);
        formData.append('upload_preset', UPLOAD_PRESET);
        try {
          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.secure_url) resolve(data.secure_url);
          else reject(new Error(data.error?.message || 'Error de Cloudinary'));
        } catch (e) { reject(e); }
      }, 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.src = URL.createObjectURL(blob);
  });
};

export const uploadProductImage = (file: File, productId: string, quality: number = 0.7): Promise<string> => {
  return compressAndUpload(file, productId, quality);
};

export const uploadBase64ToCloudinary = async (base64: string, productId: string, quality: number = 0.7): Promise<string> => {
  const res = await fetch(base64);
  const blob = await res.blob();
  return compressAndUpload(blob, productId, quality);
};
