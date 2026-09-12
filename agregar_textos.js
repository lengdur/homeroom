const textoTest = {
  posicion: '1',
  titulo: 'Historia de España',
  contenido: 'La historia de España es una de las más ricas y complejas de Europa...'
};

(async () => {
  console.log('\n=== GUARDANDO TEXTO EN SUPABASE ===\n');
  
  try {
    const response = await fetch('http://localhost:3000/api/textos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(textoTest)
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ Texto guardado`);
      console.log(`   Posición: ${textoTest.posicion}`);
      console.log(`   Título: ${textoTest.titulo}`);
    } else {
      console.log(`❌ ERROR: ${data.message}`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  // Guardar más textos
  const textos = [
    { posicion: '2', titulo: 'Geografía Física', contenido: 'España es un país con una geografía muy variada...' },
    { posicion: '3', titulo: 'Literatura Española', contenido: 'La literatura española ha aportado grandes autores...' },
    { posicion: '4', titulo: 'Arte Medieval', contenido: 'El arte medieval español es especialmente notable...' },
    { posicion: '5', titulo: 'Economía Moderna', contenido: 'La economía moderna de España...' }
  ];

  for (const texto of textos) {
    try {
      const response = await fetch('http://localhost:3000/api/textos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(texto)
      });

      const data = await response.json();
      if (data.success) {
        console.log(`✅ Posición ${texto.posicion}: ${texto.titulo}`);
      }
    } catch (err) {
      console.log(`❌ Error en posición ${texto.posicion}`);
    }
  }

  // Verificar todos los textos
  console.log('\n=== VERIFICANDO TEXTOS EN SUPABASE ===\n');
  
  try {
    const response = await fetch('http://localhost:3000/api/textos');
    const data = await response.json();

    if (data.success && data.textos) {
      console.log(`📊 Total de textos: ${data.textos.length}`);
      data.textos.forEach(t => {
        console.log(`   Pos ${t.posicion}: ${t.titulo}`);
      });
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
})();
