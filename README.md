# Ensamble Inmediato: 60/40 · Entradas

Página simple para registrar compras de entradas con pago por QR.

- `index.html`: el público elige su entrada, llena sus datos, paga con el QR y sube el comprobante.
- `admin.html`: ves los registros, marcas pagado o rechazado, editas los tiers y subes el QR.
- Los datos se guardan en una hoja de Google Sheets tuya. Los comprobantes se guardan en tu Google Drive.

Si `config.js` no tiene URL, la página funciona en **modo demo**. En modo demo la contraseña del admin es `demo`.

## Conectar con Google (una sola vez, unos 10 minutos)

### 1. Crear la hoja

1. Entra a [sheets.new](https://sheets.new) con tu cuenta de Google.
2. Ponle de nombre `Entradas 60/40`.

### 2. Pegar el código

1. En la hoja, ve a **Extensiones → Apps Script**.
2. Borra todo lo que aparece en `Código.gs`.
3. Pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
4. En la línea `const ADMIN_PASSWORD = 'cambia-esta-clave';`, cambia `cambia-esta-clave` por tu contraseña de admin.
5. Guarda con el ícono del disquete.

### 3. Ejecutar `setup`

1. Arriba, en el selector de funciones, elige **setup**.
2. Toca **Ejecutar**.
3. Google pide permisos. Toca **Revisar permisos** y elige tu cuenta.
4. Aparece "Google no verificó esta app". Es normal, porque la app es tuya.
5. Toca **Configuración avanzada → Ir a … (no seguro) → Permitir**.
6. Vuelve a la hoja. Ahora tiene las pestañas `Config`, `Tiers` y `Registros`.

### 4. Publicar como aplicación web

1. En Apps Script, toca **Implementar → Nueva implementación**.
2. En el engranaje de "Tipo", elige **Aplicación web**.
3. **Ejecutar como:** Yo.
4. **Quién tiene acceso:** Cualquier persona.
5. Toca **Implementar** y copia la **URL de la aplicación web**. Termina en `/exec`.

### 5. Pegar la URL en la página

1. Abre `config.js` en este repositorio. En GitHub puedes editarlo con el ícono del lápiz.
2. Pega la URL entre las comillas: `window.API_URL = 'https://script.google.com/macros/s/…/exec';`
3. Guarda el cambio (commit). En 1 o 2 minutos la página ya usa Google.

### 6. Probar

1. Abre `admin.html` y entra con tu contraseña.
2. En **QR y evento**, sube el QR de tu banco y completa fecha y lugar.
3. En **Tiers**, ajusta precios y cupos.
4. Haz un registro de prueba desde `index.html`, y luego márcalo como rechazado en el admin.

## Cómo funcionan los tiers

- Se venden en el orden de la lista.
- En modo **secuencial** solo se vende el primer tier disponible. Cuando se agota o pasa su fecha "hasta", se abre el siguiente.
- En modo **todos a la vez**, el público elige entre todos los tiers disponibles.
- Los registros pendientes y pagados cuentan para el cupo. Los rechazados no.

## Si cambias el código de Apps Script

Hay que publicar una versión nueva. Ve a **Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión → Implementar**. La URL sigue siendo la misma.

## Seguridad

- La contraseña del admin vive solo en Apps Script, no en este repositorio.
- La lista tiene datos personales, así que usa una contraseña larga.
- Los comprobantes en Drive son privados: solo tú puedes abrirlos.
