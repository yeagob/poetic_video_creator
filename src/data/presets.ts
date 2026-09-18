import { ImageItem, IntonationOption, MusicTrack, VoicePreset } from '../types';

export const VOICE_PRESETS: Record<'male' | 'female', VoicePreset> = {
  male: {
    id: 'male-algieba',
    name: 'Algieba — Barítono Solemne y Profundo',
    gender: 'male',
    geminiVoice: 'Algieba',
    description: 'Tono noble, potente, resonante y solemne. Ideal para declamación poética majestuosa y reflexiva.',
    badge: 'Voz Masculina Algieba',
  },
  female: {
    id: 'female-kore',
    name: 'Kore — Cálida y Expresiva',
    gender: 'female',
    geminiVoice: 'Kore',
    description: 'Tono envolvente, rico en matices, emotivo y lírico. Perfecta para versos poéticos con hondura.',
    badge: 'Voz Femenina Poética',
  },
};

export const INTONATION_OPTIONS: IntonationOption[] = [
  {
    id: 'poetic_deep',
    label: 'Lectura poética con voz profunda y potente (Por defecto)',
    description: 'Cadencia solemne, pausas dramáticas y resonancia emotiva que transmiten el peso de cada verso.',
    promptInstruction: 'Lee con entonación de lectura poética solemne, voz profunda, potente, resonante y cadencia emotiva respetando pausas poéticas:',
  },
  {
    id: 'epic_intense',
    label: 'Declamación épica e intensa',
    description: 'Voz enérgica con fuerza dramática, crescendo emocional y presencia dominante.',
    promptInstruction: 'Lee con entonación de declamación épica, vibrante, poderosa y grandilocuente:',
  },
  {
    id: 'contemplative_serene',
    label: 'Susurro sereno y contemplativo',
    description: 'Tono pausado, intimista, místico y pacífico, como una confidencia en la penumbra.',
    promptInstruction: 'Lee con tono suave, reflexivo, contemplativo, calmado e íntimo:',
  },
  {
    id: 'lyrical_nostalgic',
    label: 'Lírica nostálgica y melancólica',
    description: 'Cadencia melódica suave cargada de anhelo y belleza sutil.',
    promptInstruction: 'Lee con cadencia melancólica, nostálgica, poética y sentida:',
  },
];

export const SAMPLE_TEXTS = [
  {
    title: 'El Faro de la Noche',
    author: 'Poema Nocturno',
    text: `Bajo el manto de la noche que no duerme,
las olas cantan historias de navegantes perdidos.
La luz gira constante en la penumbra,
recordándonos que incluso en la tormenta más honda,
siempre arde una chispa de esperanza en el horizonte.`,
  },
  {
    title: 'Caminos de Viento y Tiempo',
    author: 'Reflexión del Viajero',
    text: `El viento acaricia las cimas calladas,
y en cada suspiro de la tierra renace un instante eterno.
No somos el destino al que llegamos,
sino las huellas doradas que dejamos al pasar.`,
  },
  {
    title: 'El Susurro de las Estrellas',
    author: 'Versos Cósmicos',
    text: `Miras al cielo y comprendes la inmensidad del silencio.
Somos polvo de estrellas que aprendió a sentir,
un destello fugaz en el lienzo cósmico,
amando la vida con la fuerza de un volcán dormido.`,
  },
  {
    title: 'El Bosque de Niebla',
    author: 'Ecos de la Naturaleza',
    text: `Entre los árboles centenarios la niebla avanza lenta,
guardando los secretos de las estaciones idas.
Respira la quietud del musgo y la roca,
donde el tiempo detiene su marcha para escuchar el alma.`,
  },
];

export const PRESET_IMAGE_COLLECTIONS: { name: string; description: string; images: ImageItem[] }[] = [
  {
    name: 'Naturaleza y Horizontes Místicos',
    description: 'Paisajes atmosféricos, cumbres entre nubes y costas melancólicas.',
    images: [
      {
        id: 'img-nat-1',
        name: 'Niebla sobre el bosque místico',
        url: 'https://images.unsplash.com/photo-1511497584788-87676104235f?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-nat-2',
        name: 'Olas nocturnas rompiendo en acantilado',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-nat-3',
        name: 'Cordillera nevada al amanecer dorado',
        url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-nat-4',
        name: 'Lago en calma reflejando el crepúsculo',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-nat-5',
        name: 'Camino solitario hacia el ocaso',
        url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=1200&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Cosmos y Noche Serena',
    description: 'Vía Láctea, cielos estrellados, lunas y auroras boreales.',
    images: [
      {
        id: 'img-cos-1',
        name: 'Vía Láctea sobre el desierto estrellado',
        url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-cos-2',
        name: 'Luna llena entre siluetas de abetos',
        url: 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-cos-3',
        name: 'Aurora boreal en el cielo boreal',
        url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-cos-4',
        name: 'Cielo crepuscular violeta y estrellas',
        url: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?q=80&w=1200&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Sombras, Luces y Nostalgia',
    description: 'Arquitectura etérea, faroles de lluvia y contrastes poéticos.',
    images: [
      {
        id: 'img-urb-1',
        name: 'Luces de lluvia reflejadas en el asfalto',
        url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-urb-2',
        name: 'Faro iluminando la niebla marina',
        url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-urb-3',
        name: 'Silueta solitaria contemplando el mar',
        url: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?q=80&w=1200&auto=format&fit=crop',
      },
      {
        id: 'img-urb-4',
        name: 'Vela encendida en la penumbra',
        url: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?q=80&w=1200&auto=format&fit=crop',
      },
    ],
  },
];

export const PRESET_MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'track-piano-nocturne',
    name: 'Nocturno de Piano & Cuerdas',
    artist: 'Atmósfera Clásica',
    category: 'Piano Melódico',
    type: 'preset',
  },
  {
    id: 'track-ambient-celestial',
    name: 'Brisa Celestial & Sintetizador Pad',
    artist: 'Ecos del Espacio',
    category: 'Ambient Eéreo',
    type: 'preset',
  },
  {
    id: 'track-acoustic-guitar',
    name: 'Océano & Guitarra Acústica',
    artist: 'Melancolía y Viento',
    category: 'Guitarra Poética',
    type: 'preset',
  },
  {
    id: 'track-orchestral-epic',
    name: 'Epopeya Solemne (Violonchelo & Viento)',
    artist: 'Cámara Cinematográfica',
    category: 'Cinemático',
    type: 'preset',
  },
];

export const ZOOM_EFFECT_OPTIONS = [
  { id: 'zoom-in', label: 'Acercamiento Suave (Zoom In)', description: 'Evoluciona del 100% al 114% durante toda la escena sin saltos.' },
  { id: 'zoom-out', label: 'Alejamiento Cinemático (Zoom Out)', description: 'Inicia en 114% y se abre suavemente al 100% revelando la escena.' },
  { id: 'dramatic-pulse', label: 'Respiración / Pulso Poético', description: 'Curva sinusoidal de respiración visual suave y pausada.' },
  { id: 'slow-drift', label: 'Deriva Sutil', description: 'Zoom microscópico y muy contemplativo.' },
  { id: 'random', label: 'Aleatorio Dinámico', description: 'Varía de manera armónica entre acercamientos y alejamientos.' },
  { id: 'none', label: 'Estático', description: 'Mantiene la imagen fija sin escala.' },
];

export const PAN_EFFECT_OPTIONS = [
  { id: 'diagonal-drift', label: 'Deriva Diagonal', description: 'Paneo en dos ejes con sensación de vuelo cinematográfico.' },
  { id: 'pan-left', label: 'Paneo Izquierda', description: 'Desplazamiento horizontal continuo hacia la izquierda.' },
  { id: 'pan-right', label: 'Paneo Derecha', description: 'Desplazamiento horizontal continuo hacia la derecha.' },
  { id: 'drift-up', label: 'Elevación Vertical', description: 'Desplazamiento vertical ascendente hacia el cielo.' },
  { id: 'random', label: 'Dirección Aleatoria', description: 'Alterna direcciones en cada cambio de imagen.' },
  { id: 'none', label: 'Centrado Fijo', description: 'Sin paneo horizontal ni vertical.' },
];

export const COLOR_GRADE_OPTIONS = [
  { id: 'golden-hour', label: 'Hora Dorada (Golden Hour)', description: 'Calidez ámbar, tonos de atardecer y resplandor suave.' },
  { id: 'vintage-film', label: 'Película 35mm Vintage', description: 'Textura nostálgica con sutil grano y tinte analógico.' },
  { id: 'noir-monochrome', label: 'Cine Noir (Blanco y Negro)', description: 'Monocromo de alto contraste lírico y poético.' },
  { id: 'ethereal-dream', label: 'Sueño Etéreo (Glow)', description: 'Difusión de altas luces luminosa y celestial.' },
  { id: 'twilight-cool', label: 'Crepúsculo Azul', description: 'Tonos fríos crepusculares y azul profundo nocturno.' },
  { id: 'natural', label: 'Color Natural', description: 'Paleta original de la fotografía sin filtros adicionales.' },
];

export const TRANSITION_OPTIONS = [
  { id: 'light-leaks', label: 'Fugas de Luz (Light Leaks)', description: 'Destellos anamórficos dorados y cálidos que barren la pantalla.' },
  { id: 'glitch', label: 'Glitch Digital / Cromático', description: 'Separación cromática RGB y barrido de scanlines tecnológico.' },
  { id: 'crossfade', label: 'Difuminado Suave (Crossfade)', description: 'Transición sinusoidal pura y poética entre fotos.' },
  { id: 'zoom-blur', label: 'Aceleración Warp / Zoom Blur', description: 'Desenfoque dinámico por velocidad de cámara.' },
  { id: 'film-burn', label: 'Quemado de Celuloide', description: 'Destello incandescente tipo película de proyector.' },
  { id: 'random', label: 'Transición Aleatoria', description: 'Combina creativamente los diferentes efectos en cada cambio.' },
];

