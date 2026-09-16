# Estructura del Proyecto

## Archivos principales

### Cliente estático
- `index.html`: enlace de entrada que redirige a iniciar sesión.
- `supabase-config.js`: URL y clave pública `anon` para el navegador. Nunca contiene `service_role`.
- `inutiles/supabase-schema.sql`: tablas, RLS, trigger de perfiles y Storage.
- `uploads/`: archivos antiguos del servidor; los nuevos se guardan en el bucket `archivos` de Supabase.

`server-supabase.js`, `.env` y `package.json` solo se conservan para tareas antiguas de administración local. Las páginas ya no dependen de ellos.

### Autenticación y navegación
- `iniciar_sesion.html`: inicio de sesión y redirección según el rango.
- `crear_cuenta.html`: registro con correo, contraseña, centro de estudios y curso.
- `verificar_correo.html`: introduce el código enviado por correo para activar la cuenta.
- `inicio.html`: página principal con menú lateral y cierre de sesión.
- `admin.html`: panel visible solo para usuarios con rango `admin`.

### Contenidos
- `textos.html`: muestra los textos guardados en Supabase con descripción al pasar el ratón.
- `admin_textos.html`: crea, actualiza y elimina textos por tema.
- `exposiciones.html`: muestra las exposiciones guardadas en Supabase y permite solicitar una exposición.
- `admin_exposiciones.html`: crea, actualiza y elimina exposiciones por tema.
- `preguntas.html`: permite enviar preguntas asociadas al usuario.
- `archivos.html`: biblioteca de archivos filtrable por tema y por tipo; los administradores pueden subir material.

### Solicitudes
- `solicitudes.html`: menú del usuario con solicitudes `En curso` y `Completadas`.
- `solicitudes_admin.html`: listado global para administradores, ordenado por antigüedad; permite subir el archivo final y marcar la solicitud como completada.

### Base de datos
- `inutiles/supabase-schema.sql`: esquema SQL de Supabase.
- `configurar_supabase.html`: instrucciones para ejecutar el esquema en Supabase.
- `setup-db.js`: comprobación local de las tablas configuradas.

## Tablas de Supabase

- `usuarios`: datos de acceso, centro, curso y rango (`usuario` o `admin`).
- `preguntas`: preguntas asociadas al correo del usuario.
- `textos`: título, contenido, posición y archivo opcional.
- `exposiciones`: título, contenido, posición y archivo opcional.
- `archivos`: metadatos de los archivos de la biblioteca, con tema y tipo (`texto` o `exposicion`).
- `solicitudes`: usuario, tipo, tema, número de páginas, descripción, archivo y estado (`en_curso` o `completada`).

## Publicación sin servidor local

1. En Supabase, abre `SQL Editor` y ejecuta todo `inutiles/supabase-schema.sql`.

2. En `Project Settings > API`, copia la `anon public key` en `supabase-config.js`, sustituyendo `PEGA_AQUI_TU_ANON_KEY`.

3. En `Authentication > URL Configuration`, añade la URL pública de la web como `Site URL` y como redirect URL `*/verificar_correo.html`.

4. Publica la carpeta en cualquier hosting estático, por ejemplo GitHub Pages, Netlify o Vercel. El enlace público debe apuntar a `index.html` (o al dominio raíz).

No abras la aplicación usando `localhost` ni compartas el `.env`. La clave `service_role` y las credenciales SMTP del `.env` deben rotarse si alguna vez se han compartido.

### Herramientas antiguas

Para ejecutar solo las comprobaciones locales heredadas:

   ```powershell
   npm.cmd install
   ```

Configura `.env`:

   ```text
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=tu_clave_de_servicio
   PORT=3000
   SMTP_HOST=smtp.tu-proveedor.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=tu-cuenta-de-correo
   SMTP_PASS=tu-contraseña-o-clave-smtp
   SMTP_FROM=tu-cuenta-de-correo
   ```

Inicia el servidor antiguo:

   ```powershell
   node server-supabase.js
   ```

Abrir:

   - Login: http://localhost:3000/iniciar_sesion.html
   - Registro: http://localhost:3000/crear_cuenta.html
   - Página principal: http://localhost:3000/inicio.html

## Rangos y solicitudes

- Las cuentas nuevas reciben el rango `usuario`.
- Las cuentas nuevas reciben un código de verificación de 6 dígitos por correo y no pueden iniciar sesión hasta validarlo.
- El rango `admin` se asigna directamente en Supabase.
- Solo los administradores ven el panel de administración.
- Cada usuario solo puede consultar sus propias solicitudes.
- Al subir el archivo final desde administración, la solicitud pasa automáticamente a `completada`.

## Archivos antiguos

La carpeta `inutiles/` contiene scripts, documentación y archivos de versiones anteriores que no forman parte del flujo principal actual. `database.sqlite` tampoco se utiliza: la persistencia actual depende de Supabase.
