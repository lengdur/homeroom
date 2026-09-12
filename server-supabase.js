const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const mailTransporter = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const uploadsDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });
const upload = multer({ dest: uploadsDirectory });
app.use('/uploads', express.static(uploadsDirectory));
const sessions = new Map();

function getSession(req) {
  const cookies = req.headers.cookie || '';
  const sessionCookie = cookies.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith('sessionId='));
  return sessionCookie ? sessions.get(sessionCookie.slice('sessionId='.length)) : null;
}

async function isAdmin(email) {
  if (!email) return false;
  const { data } = await supabase
    .from('usuarios')
    .select('rango')
    .eq('email', email.trim())
    .single();
  return data?.rango === 'admin';
}

app.post('/api/register', async (req, res) => {
  const { email, password, centro_estudios, curso } = req.body;

  if (!email || !password || !centro_estudios || !curso) {
    return res.status(400).json({ success: false, message: 'Faltan datos.' });
  }

  if (!mailTransporter) {
    return res.status(503).json({ success: false, message: 'El servicio de correo no está configurado.' });
  }

  const verificationCode = createVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ 
        email: email.trim(), 
        password, 
        centro_estudios: centro_estudios.trim(),
        curso: curso.trim(),
        rango: 'usuario',
        email_verificado: false,
        codigo_verificacion_hash: verificationCodeHash,
        codigo_verificacion_expira: verificationExpiresAt
      }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'El usuario ya existe.' });
      }
      throw error;
    }

    try {
      await mailTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email.trim(),
        subject: 'Código de verificación',
        text: `Tu código de verificación es: ${verificationCode}. Caduca en 15 minutos.`
      });
    } catch (mailError) {
      await supabase.from('usuarios').delete().eq('email', email.trim());
      return res.status(502).json({ success: false, message: 'No se pudo enviar el código de verificación. Revisa la configuración SMTP.', detail: mailError.message });
    }

    return res.status(201).json({ success: true, message: 'Te hemos enviado un código de verificación.', email: email.trim() });
  } catch (err) {
    if (err.message && err.message.includes('codigo_verificacion_expira')) {
      return res.status(503).json({
        success: false,
        message: 'La base de datos no está actualizada. Ejecuta la migración de verificación de correo en Supabase.'
      });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'El usuario ya existe.' });
    }
    return res.status(500).json({ success: false, message: 'Error al crear la cuenta.', detail: err.message });
  }
});

app.post('/api/verify-email', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const code = String(req.body.code || '').trim();

  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Introduce el correo y un código de 6 dígitos.' });
  }

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('email, email_verificado, codigo_verificacion_hash, codigo_verificacion_expira')
      .eq('email', email)
      .single();

    if (error || !user) return res.status(400).json({ success: false, message: 'Código no válido.' });
    if (user.email_verificado) return res.json({ success: true, message: 'El correo ya estaba verificado.' });
    if (!user.codigo_verificacion_expira || new Date(user.codigo_verificacion_expira) < new Date()) {
      return res.status(400).json({ success: false, message: 'El código ha caducado.' });
    }
    if (hashVerificationCode(code) !== user.codigo_verificacion_hash) {
      return res.status(400).json({ success: false, message: 'Código no válido.' });
    }

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ email_verificado: true, codigo_verificacion_hash: null, codigo_verificacion_expira: null })
      .eq('email', email);

    if (updateError) throw updateError;
    return res.json({ success: true, message: 'Correo verificado correctamente.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'No se pudo verificar el correo.', detail: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Faltan datos.' });
  }

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email.trim())
      .eq('password', password)
      .single();

    if (error || !data) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }

    if (data.email_verificado === false) {
      if (!mailTransporter) {
        return res.status(503).json({ success: false, message: 'El servicio de correo no está configurado.' });
      }

      const verificationCode = createVerificationCode();
      const verificationCodeHash = hashVerificationCode(verificationCode);
      const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ codigo_verificacion_hash: verificationCodeHash, codigo_verificacion_expira: verificationExpiresAt })
        .eq('email', data.email);

      if (updateError) throw updateError;

      try {
        await mailTransporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: data.email,
          subject: 'Nuevo código de verificación',
          text: `Tu nuevo código de verificación es: ${verificationCode}. Caduca en 15 minutos.`
        });
      } catch (mailError) {
        return res.status(502).json({ success: false, message: 'No se pudo enviar el código de verificación.', detail: mailError.message });
      }

      return res.status(403).json({
        success: false,
        verificationRequired: true,
        email: data.email,
        message: 'Te hemos enviado un nuevo código de verificación.'
      });
    }

    const rango = typeof data.rango === 'string' && data.rango.trim()
      ? data.rango.trim()
      : 'usuario';

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { email: data.email, rango });
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; SameSite=Lax; Path=/`);

    return res.json({
      success: true,
      message: 'Inicio de sesión correcto.',
      email: data.email,
      rango
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al iniciar sesión.', detail: err.message });
  }
});

app.post('/api/solicitudes', async (req, res) => {
  const session = getSession(req);
  const { tipo, tema, paginas, descripcion } = req.body;

  if (!session || !tipo || !tema || !paginas || !descripcion) {
    return res.status(400).json({ success: false, message: 'Completa todos los campos.' });
  }

  try {
    const { data, error } = await supabase
      .from('solicitudes')
      .insert([{ email: session.email, tipo, tema, paginas: Number(paginas), descripcion: descripcion.trim(), estado: 'en_curso' }])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, solicitud: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'No se pudo guardar la solicitud.', detail: err.message });
  }
});

app.get('/api/solicitudes', async (req, res) => {
  try {
    const session = getSession(req);
    if (!session) return res.status(401).json({ success: false, message: 'Inicia sesión para ver tus solicitudes.' });

    const admin = session.rango === 'admin';
    const query = supabase.from('solicitudes').select('*').order('created_at', { ascending: true });
    if (!admin) query.eq('email', session.email);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, solicitudes: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'No se pudieron consultar las solicitudes.', detail: err.message });
  }
});

app.post('/api/solicitudes/:id/archivo', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Selecciona un archivo.' });

  try {
    if (!(await isAdmin(getSession(req)?.email))) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'No tienes permisos de administrador.' });
    }

    const archivoUrl = `/uploads/${req.file.filename}`;
    const { data, error } = await supabase
      .from('solicitudes')
      .update({ archivo_url: archivoUrl, estado: 'completada' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, solicitud: data });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ success: false, message: 'No se pudo subir el archivo.', detail: err.message });
  }
});

app.patch('/api/solicitudes/:id/estado', async (req, res) => {
  try {
    if (!(await isAdmin(getSession(req)?.email))) {
      return res.status(403).json({ success: false, message: 'No tienes permisos de administrador.' });
    }

    const estado = req.body.estado === 'completada' ? 'completada' : 'en_curso';
    const { data, error } = await supabase
      .from('solicitudes')
      .update({ estado })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, solicitud: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'No se pudo actualizar el estado.', detail: err.message });
  }
});

app.post('/api/preguntas', async (req, res) => {
  const { email, pregunta } = req.body;

  if (!email || !pregunta) {
    return res.status(400).json({ success: false, message: 'Faltan datos.' });
  }

  try {
    const { data, error } = await supabase
      .from('preguntas')
      .insert([{ email: email.trim(), pregunta: pregunta.trim() }])
      .select();

    if (error) throw error;

    return res.status(201).json({ success: true, message: 'Pregunta guardada.', pregunta: data?.[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'No se pudo guardar la pregunta.', detail: err.message });
  }
});

app.get('/api/preguntas/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const { data, error } = await supabase
      .from('preguntas')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ success: true, preguntas: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al consultar preguntas.', detail: err.message });
  }
});

app.get('/api/verificar-db', async (req, res) => {
  try {
    const { data: usuarios, error: errorUsuarios } = await supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: preguntas, error: errorPreguntas } = await supabase
      .from('preguntas')
      .select('*')
      .order('created_at', { ascending: false });

    return res.json({
      success: true,
      usuarios: {
        error: errorUsuarios ? errorUsuarios.message : null,
        count: usuarios ? usuarios.length : 0,
        data: usuarios || []
      },
      preguntas: {
        error: errorPreguntas ? errorPreguntas.message : null,
        count: preguntas ? preguntas.length : 0,
        data: preguntas || []
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error', detail: err.message });
  }
});

// ===== ENDPOINTS PARA TEXTOS =====

app.get('/api/textos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('textos')
      .select('*')
      .order('posicion', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, textos: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al consultar textos.', detail: err.message });
  }
});

app.post('/api/textos', upload.single('archivo'), async (req, res) => {
  const { posicion, titulo, contenido } = req.body;

  if (!posicion || !titulo) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios.' });
  }

  try {
    // Validar que la posición esté entre 1 y 5
    if (parseInt(posicion) < 1 || parseInt(posicion) > 5) {
      return res.status(400).json({ success: false, message: 'La posición debe estar entre 1 y 5.' });
    }

    // Intentar actualizar si existe, sino crear
    const { data: existing } = await supabase
      .from('textos')
      .select('id')
      .eq('posicion', posicion)
      .single();

    let data, error;

    if (existing) {
      // Actualizar
      const updates = {
        titulo: titulo.trim(),
        contenido: contenido ? contenido.trim() : null
      };
      if (req.file) updates.archivo_url = `/uploads/${req.file.filename}`;

      const result = await supabase
        .from('textos')
        .update(updates)
        .eq('posicion', posicion)
        .select();
      
      data = result.data;
      error = result.error;
    } else {
      // Crear
      const result = await supabase
        .from('textos')
        .insert([{
          posicion: parseInt(posicion),
          titulo: titulo.trim(),
          contenido: contenido ? contenido.trim() : null,
          archivo_url: req.file ? `/uploads/${req.file.filename}` : null
        }])
        .select();
      
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    return res.status(201).json({ success: true, message: 'Texto guardado correctamente.', texto: data?.[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al guardar texto.', detail: err.message });
  }
});

app.delete('/api/textos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('textos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({ success: true, message: 'Texto eliminado correctamente.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al eliminar texto.', detail: err.message });
  }
});

// ===== ENDPOINTS PARA EXPOSICIONES =====

app.get('/api/exposiciones', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('exposiciones')
      .select('*')
      .order('posicion', { ascending: true });

    if (error) throw error;
    return res.json({ success: true, exposiciones: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al consultar exposiciones.', detail: err.message });
  }
});

app.post('/api/exposiciones', async (req, res) => {
  const { posicion, titulo, contenido } = req.body;

  if (!posicion || !titulo) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios.' });
  }

  const numericPosition = Number(posicion);
  if (!Number.isInteger(numericPosition) || numericPosition < 1 || numericPosition > 5) {
    return res.status(400).json({ success: false, message: 'El tema debe estar entre 1 y 5.' });
  }

  try {
    const { data, error } = await supabase
      .from('exposiciones')
      .upsert([{
        posicion: numericPosition,
        titulo: titulo.trim(),
        contenido: contenido ? contenido.trim() : null
      }], { onConflict: 'posicion' })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, exposicion: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al guardar exposición.', detail: err.message });
  }
});

app.delete('/api/exposiciones/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('exposiciones')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    return res.json({ success: true, message: 'Exposición eliminada correctamente.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al eliminar exposición.', detail: err.message });
  }
});

// ===== RUTAS PRINCIPALES =====

app.get('/textos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('textos')
      .select('*')
      .order('posicion', { ascending: true });

    if (error) throw error;

    const textos = data || [];
    
    // Generar el grid con los textos
    const cardsHTML = textos.map(t => {
      const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
      return `<a class="card" href="${escapeHtml(t.archivo_url || '#')}" ${t.archivo_url ? 'target="_blank"' : ''}><span>${escapeHtml(t.titulo)}</span><span class="card-description">${escapeHtml(t.contenido || 'Sin descripción disponible.')}</span></a>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Textos</title>
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          linear-gradient(rgba(150, 180, 240, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(150, 180, 240, 0.05) 1px, transparent 1px),
          linear-gradient(135deg, #eef6ff 0%, #eaf2ff 28%, #dfeeff 100%);
        background-size: 28px 28px, 28px 28px, 100% 100%;
        font-family: "Trebuchet MS", "Segoe UI", Arial, sans-serif;
      }

      .container {
        width: min(90vw, 980px);
        background: rgba(255, 255, 255, 0.55);
        border: 2px solid #bfd4f7;
        border-radius: 18px;
        box-shadow: 0 12px 28px rgba(90, 112, 163, 0.12), inset 0 0 0 2px rgba(255,255,255,0.6);
        padding: 28px 22px;
        position: relative;
      }

      .btn-inicio {
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        border-radius: 10px;
        background: linear-gradient(135deg, #dfeeff, #cfe0ff);
        border: 2px solid rgba(115, 150, 215, 0.7);
        color: #264c7a;
        text-decoration: none;
        font-weight: 700;
        box-shadow: 0 8px 18px rgba(93, 127, 178, 0.12);
      }

      .container::before {
        content: "";
        position: absolute;
        inset: 10px 12px;
        border: 1px solid rgba(126, 153, 210, 0.4);
        border-radius: 12px;
        pointer-events: none;
      }

      h1 {
        text-align: center;
        color: #3d5d8d;
        font-size: clamp(2rem, 4vw, 2.8rem);
        margin: 0 0 26px;
      }

      .grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(5, minmax(140px, 1fr));
        gap: 20px;
      }

      .card {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        color: #264c7a;
        min-height: 240px;
        width: 100%;
        border-radius: 15px;
        background: linear-gradient(135deg, #dfeeff, #cfe0ff);
        border: 2px solid rgba(115, 150, 215, 0.7);
        box-shadow: 0 10px 18px rgba(93, 127, 178, 0.12);
        font-weight: 700;
        font-size: clamp(1rem, 2vw, 1.4rem);
        transition: transform 0.25s ease, box-shadow 0.25s ease;
        text-align: center;
        padding: 16px;
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }

      .card span {
        writing-mode: horizontal-tb;
        display: inline-block;
      }

      .card-description {
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: 10px;
        padding: 9px;
        border-radius: 8px;
        background: rgba(38, 76, 122, 0.92);
        color: white;
        font-size: 0.78rem;
        line-height: 1.25;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
        writing-mode: horizontal-tb;
      }

      .card:hover .card-description,
      .card:focus-visible .card-description {
        opacity: 1;
        transform: translateY(0);
      }

      .card:hover {
        transform: translateY(-6px) scale(1.02);
        box-shadow: 0 14px 24px rgba(93, 127, 178, 0.18);
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: repeat(3, minmax(140px, 1fr));
        }
      }

      @media (max-width: 620px) {
        .grid {
          grid-template-columns: repeat(2, minmax(130px, 1fr));
        }
      }

      .floating-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999;
        padding: 14px 28px;
        background: linear-gradient(135deg, #667eea, #5568d3);
        color: white;
        border: none;
        border-radius: 50px;
        font-weight: 700;
        font-size: 16px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
        transition: all 0.3s ease;
      }

      .floating-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 32px rgba(102, 126, 234, 0.4);
      }

      .floating-btn:active {
        transform: translateY(-1px);
      }

      @media (max-width: 620px) {
        .floating-btn {
          bottom: 16px;
          right: 16px;
          padding: 12px 20px;
          font-size: 14px;
        }
      }
    </style>
  </head>
  <body>
    <a class="btn-inicio" href="inicio.html">← Inicio</a>

    <div class="container">
      <h1>Textos</h1>

      <div class="grid">
        ${cardsHTML}
      </div>
    </div>

    <button class="floating-btn" onclick="alert('📧 Solicitud de texto enviada. Nos pondremos en contacto pronto.')">📬 Solicitar texto</button>
  </body>
</html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send('<p>Error al cargar textos</p>');
  }
});

app.get('/configurar', (req, res) => {
  res.sendFile(path.join(__dirname, 'configurar_supabase.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'iniciar_sesion.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor en internet-ready en http://localhost:${PORT}`);
});
