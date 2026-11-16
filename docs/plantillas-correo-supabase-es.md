# Plantillas de Correo Electrónico en Español para Supabase Auth — Crash Solution / MiTallerAPP

Estas plantillas están listas para configurarse en **Supabase Dashboard → Authentication → Email Templates**. Conservan las variables oficiales y seguras de Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`, `{{ .TokenHash }}`) y no incluyen credenciales ni claves.

---

## 1. Invitación de usuario (`Invite user`)

- **Asunto (`Subject`):**
  `Invitación para activar tu cuenta en Crash Solution`

- **Cuerpo HTML (`Message body`):**
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Activá tu cuenta en Crash Solution</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f4f6f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d3348;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e1e7ed;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background-color:#132c43;padding:22px 28px;color:#ffffff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a8caff;text-transform:uppercase;">CRASH SOLUTION · MITALLERAPP</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">Fuiste invitado a sumarte al taller</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hola,</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334b61;">
            El administrador del taller creó un acceso para tu cuenta <strong>{{ .Email }}</strong> en <strong>Crash Solution</strong>.
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#334b61;">
            Hacé clic en el siguiente botón para abrir la pantalla de activación y definir tu propia contraseña personal:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 24px;background-color:#2867d5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
              Activar mi cuenta
            </a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#718295;">
            Si el botón no se abre directamente, copiá y pegá este enlace de uso único en tu navegador:<br>
            <span style="word-break:break-all;color:#2867d5;">{{ .ConfirmationURL }}</span>
          </p>
          <hr style="border:0;border-top:1px solid #e1e7ed;margin:20px 0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#718295;">
            Por seguridad, este enlace es personal y tiene vigencia limitada. Si no reconocés esta invitación, podés ignorar este mensaje sin que se realice ningún cambio.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 2. Recuperación de contraseña (`Reset password`)

- **Asunto (`Subject`):**
  `Restablecé tu contraseña en Crash Solution`

- **Cuerpo HTML (`Message body`):**
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Recuperar contraseña — Crash Solution</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f4f6f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d3348;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e1e7ed;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background-color:#132c43;padding:22px 28px;color:#ffffff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a8caff;text-transform:uppercase;">CRASH SOLUTION · SEGURIDAD DE CUENTA</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">Solicitud de cambio de contraseña</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hola,</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334b61;">
            Recibimos una solicitud para restablecer la contraseña de la cuenta asociada al correo <strong>{{ .Email }}</strong>.
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#334b61;">
            Para elegir una nueva contraseña segura, pulsá el siguiente botón:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 24px;background-color:#2867d5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
              Crear nueva contraseña
            </a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#718295;">
            Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br>
            <span style="word-break:break-all;color:#2867d5;">{{ .ConfirmationURL }}</span>
          </p>
          <hr style="border:0;border-top:1px solid #e1e7ed;margin:20px 0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#718295;">
            Si no solicitaste restablecer tu contraseña, ignorá este correo. Tu contraseña actual permanecerá sin cambios.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 3. Confirmación de cuenta (`Confirm signup`)

- **Asunto (`Subject`):**
  `Confirmá tu correo electrónico en Crash Solution`

- **Cuerpo HTML (`Message body`):**
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Confirmá tu cuenta — Crash Solution</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f4f6f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d3348;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e1e7ed;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background-color:#132c43;padding:22px 28px;color:#ffffff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a8caff;text-transform:uppercase;">CRASH SOLUTION · BIENVENIDA</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">Confirmá tu correo electrónico</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">¡Bienvenido/a a Crash Solution!</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334b61;">
            Para finalizar el alta de tu cuenta (<strong>{{ .Email }}</strong>), confirmá tu dirección de correo electrónico haciendo clic en el botón:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 24px;background-color:#2867d5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
              Confirmar correo electrónico
            </a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#718295;">
            Enlace alternativo:<br>
            <span style="word-break:break-all;color:#2867d5;">{{ .ConfirmationURL }}</span>
          </p>
          <hr style="border:0;border-top:1px solid #e1e7ed;margin:20px 0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#718295;">
            Si no creaste una cuenta en Crash Solution, podés descartar este correo.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 4. Cambio de correo electrónico (`Change email address`)

- **Asunto (`Subject`):**
  `Confirmá el cambio de correo electrónico en Crash Solution`

- **Cuerpo HTML (`Message body`):**
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Confirmar cambio de correo — Crash Solution</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f4f6f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d3348;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e1e7ed;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background-color:#132c43;padding:22px 28px;color:#ffffff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a8caff;text-transform:uppercase;">CRASH SOLUTION · TU CUENTA</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">Confirmación de nuevo correo electrónico</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hola,</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334b61;">
            Solicitaste actualizar el correo electrónico de tu cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>.
          </p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#334b61;">
            Hacé clic en el siguiente botón para autorizar el cambio:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 24px;background-color:#2867d5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
              Confirmar cambio de correo
            </a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#718295;">
            Enlace directo:<br>
            <span style="word-break:break-all;color:#2867d5;">{{ .ConfirmationURL }}</span>
          </p>
          <hr style="border:0;border-top:1px solid #e1e7ed;margin:20px 0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#718295;">
            Si no realizaste esta solicitud, no abras el enlace y revisá la seguridad de tu cuenta.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```
