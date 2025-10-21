import React, { useEffect, useRef, useState } from "react";
import { Rive } from "@rive-app/canvas";

interface RiveToSpriteProps {
  src: string;           // путь к .riv файлу
  animation: string;     // название анимации внутри Rive
  frames?: number;       // количество кадров
  fps?: number;          // кадров в секунду
  width?: number;        // ширина кадра
  height?: number;       // высота кадра
}

const RiveToSprite: React.FC<RiveToSpriteProps> = ({
  src,
  animation,
  frames = 60,
  fps = 30,
  width = 256,
  height = 256,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function exportSprite() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rive = new Rive({
        src,
        canvas,
        autoplay: false,
      });

      await new Promise<void>((resolve) => rive.on("load", () => resolve()));

      rive.play(animation);

      const frameImages: ImageData[] = [];

      for (let i = 0; i < frames; i++) {
        rive.advance(1 / fps);
        frameImages.push(ctx.getImageData(0, 0, width, height));
      }

      // Собираем спрайт-лист
      const spriteCanvas = document.createElement("canvas");
      spriteCanvas.width = width * frames;
      spriteCanvas.height = height;
      const spriteCtx = spriteCanvas.getContext("2d");
      if (!spriteCtx) return;

      for (let i = 0; i < frames; i++) {
        spriteCtx.putImageData(frameImages[i], i * width, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        spriteCanvas.toBlob((b) => resolve(b), "image/png")
      );

      if (blob) {
        const url = URL.createObjectURL(blob);
        setSpriteUrl(url);
      }

      setIsLoading(false);
    }

    exportSprite();
  }, [src, animation, frames, fps, width, height]);

  return (
    <div style={{ textAlign: "center" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: "none" }}
      />

      {isLoading ? (
        <p>⏳ Генерация спрайта...</p>
      ) : spriteUrl ? (
        <>
          <img
            src={spriteUrl}
            alt="Sprite sheet"
            style={{
              width: "100%",
              maxWidth: "800px",
              border: "1px solid #ccc",
              marginTop: "1rem",
            }}
          />
          <a href={spriteUrl} download="spritesheet.png">
            <button
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "#2563eb",
                color: "white",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Скачать PNG
            </button>
          </a>
        </>
      ) : (
        <p>⚠️ Не удалось сгенерировать спрайт</p>
      )}
    </div>
  );
};

export default RiveToSprite;
