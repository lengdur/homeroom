const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

(async () => {
  console.log('\n=== VERIFICANDO Y CREANDO TABLAS EN SUPABASE ===\n');

  try {
    // Verificar tabla usuarios
    console.log('1️⃣ Verificando tabla usuarios...');
    const { data: usuarios, error: userError } = await supabase
      .from('usuarios')
      .select('count', { count: 'exact' })
      .limit(1);
    
    if (!userError) {
      console.log('   ✅ Tabla usuarios existe');
    } else {
      console.log('   ⚠️ Tabla usuarios no existe (crear en Supabase)');
    }

    // Verificar tabla preguntas
    console.log('2️⃣ Verificando tabla preguntas...');
    const { data: preguntas, error: pregError } = await supabase
      .from('preguntas')
      .select('count', { count: 'exact' })
      .limit(1);
    
    if (!pregError) {
      console.log('   ✅ Tabla preguntas existe');
    } else {
      console.log('   ⚠️ Tabla preguntas no existe (crear en Supabase)');
    }

    // Verificar tabla textos
    console.log('3️⃣ Verificando tabla textos...');
    const { data: textos, error: texError } = await supabase
      .from('textos')
      .select('count', { count: 'exact' })
      .limit(1);
    
    if (!texError) {
      console.log('   ✅ Tabla textos existe');
    } else {
      console.log('   ⚠️ Tabla textos no existe. Necesitas ejecutar el SQL en Supabase.');
    }

    console.log('\n=== RESUMEN ===');
    console.log('Si ves ⚠️, necesitas ejecutar el SQL en Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/jtfqkiwfyynysyqrvmjz/sql/new');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
