"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RecoveryCode({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  return <div className="notice form-stack">
    <label>Código personal de recuperación<input readOnly value={code} spellCheck={false}
      onFocus={(event) => event.target.select()} /></label>
    <p>Guárdalo en un lugar privado, separado del PIN. Se muestra solo ahora y sirve una vez para recuperar tu acceso.</p>
    <Button variant="secondary" onClick={async () => {
      try {
        await navigator.clipboard.writeText(code);
        setMessage("Código copiado.");
      } catch {
        setMessage("Selecciona el código y cópialo desde el campo.");
      }
    }}>Copiar código</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
