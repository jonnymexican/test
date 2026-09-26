// The generated city: vibes, landmarks, and the quest templates that compose
// them into playable quests. All data, no logic — the engine does the math.

export const VIBES = [
  { id: 'nature',  label: '🌳 Nature' },
  { id: 'culture', label: '🏛️ Culture' },
  { id: 'food',    label: '☕ Food' },
  { id: 'night',   label: '🌃 Night' },
  { id: 'secret',  label: '🗝️ Secrets' },
];

export const DURATIONS = [
  { id: 'quick', label: 'Quick (15–20 min)', maxKm: 1.2, checkpoints: 3 },
  { id: 'half',  label: 'Half hour (30 min)', maxKm: 2.2, checkpoints: 4 },
  { id: 'long',  label: 'Long stroll (1 hr)', maxKm: 3.5, checkpoints: 5 },
];

// Anchors give the generated city real-world texture. Names are generic on
// purpose — the mapper attaches them to generated coordinates near you.
export const CITIES = [
  { name: 'Harborline',    vibe: 'waterfront walks and gull-noise mornings' },
  { name: 'Old Mill',      vibe: 'brick lanes and bakery smells' },
  { name: 'The Terrace',   vibe: 'steep steps and sudden views' },
  { name: 'Greenbank',     vibe: 'willow shade and pond ducks' },
  { name: 'Lantern Row',   vibe: 'noodle steam and neon after dark' },
];

// Landmark kinds per vibe; each becomes a named checkpoint on a quest.
export const LANDMARKS = {
  nature: [
    { name: 'Willow Bend',        icon: '🌿', detail: 'An old willow leans out over the water here.' },
    { name: 'Pocket Park',        icon: '🌳', detail: 'Three benches, one magnificent oak, zero crowds.' },
    { name: 'Duck Landing',       icon: '🦆', detail: 'The ducks clearly run this stretch of shore.' },
    { name: 'Wildflower Strip',   icon: '🌸', detail: 'A ten-metre ribbon of poppies and bees.' },
    { name: 'Shaded Grove',       icon: '🍃', detail: 'Five degrees cooler under this canopy, guaranteed.' },
  ],
  culture: [
    { name: 'Mural Corner',       icon: '🎨', detail: 'A whole wall of geometric birds, best at noon.' },
    { name: 'Heritage Plaque',    icon: '🏛️', detail: 'Somebody famous slept here, allegedly.' },
    { name: 'Old Steps',          icon: '🪜', detail: 'Worn stone stairs that have seen a century of feet.' },
    { name: 'Little Gallery',     icon: '🖼️', detail: 'A window-sized gallery; the exhibit rotates weekly.' },
    { name: 'Clock Fountain',     icon: '⏰', detail: 'It chimes off-time, and locals consider that charming.' },
  ],
  food: [
    { name: 'Corner Espresso',    icon: '☕', detail: 'The flat white here has a cult following.' },
    { name: 'Market Stalls',      icon: '🧺', detail: 'Crate mountains of oranges and a cheese van.' },
    { name: 'Bakery Vent',        icon: '🥐', detail: 'You will smell this before you see it.' },
    { name: 'Dumpling Window',    icon: '🥟', detail: 'Six dumplings, one window, endless queue wisdom.' },
    { name: 'Gelato Bench',       icon: '🍨', detail: 'Pistachio, always pistachio.' },
  ],
  night: [
    { name: 'Skyline Gap',        icon: '🌆', detail: 'A gap between buildings frames the towers perfectly.' },
    { name: 'Rooftop Rail',       icon: '🌃', detail: 'Twelve storeys up, the traffic sounds like the sea.' },
    { name: 'Lantern Bridge',     icon: '🏮', detail: 'Strings of bulbs sway over the water at dusk.' },
    { name: 'Neon Alley',         icon: '💫', detail: 'Pink and cyan reflections in wet asphalt.' },
    { name: 'Late Arcade',        icon: '🕹️', detail: 'One machine still blinks here after midnight.' },
  ],
  secret: [
    { name: 'Hidden Door',        icon: '🚪', detail: 'A green door with no number. Knock responsibly.' },
    { name: 'Stairway Poem',      icon: '📜', detail: 'Nine lines of verse painted on the risers.' },
    { name: 'Tiny Library',       icon: '📚', detail: 'A cupboard of books with an honesty notebook.' },
    { name: 'Wishing Grate',      icon: '🪙', detail: 'Coins glitter in the storm drain. Make it count.' },
    { name: 'Cat Lookout',        icon: '🐈', detail: 'A wall cat surveys the alley. Nod in passing.' },
  ],
};

export const CHECKPOINT_TASKS = [
  'Count the {count} and log the number.',
  'Find {thing} and photograph it in your mind — no photos needed.',
  'Stand here for sixty seconds and name three sounds.',
  'Walk to {thing} and back without checking your phone.',
  'Leave {thing} better than you found it — tidy, straighten, or wave.',
  'Ask someone (or yourself loudly): what is the best thing here?',
];

export const TASK_THINGS = ['the oldest thing in view', 'something red', 'a leaf bigger than your hand', 'a door you have never noticed', 'the quietest spot'];

// Quest templates: a shape the engine fills with landmarks + tasks.
export const QUEST_TEMPLATES = [
  { id: 'wander',      title: 'The {kind} Wander',    intro: 'A loop that trusts the streets to surprise you.' },
  { id: 'chase',       title: 'Chasing {kind}',        intro: 'Three windows, three angles, one town.' },
  { id: 'collection',  title: '{kind} Collection',     intro: 'Gather small moments, keep them forever.' },
  { id: 'threshold',   title: 'The {kind} Threshold',  intro: 'Every door here is the start of a story.' },
  { id: 'return',      title: 'There and Back: {kind}', intro: 'Out one way, home another, richer both ways.' },
];

export const QUEST_KINDS = ['Slow', 'Quiet', 'Golden', 'Curious', 'Dizzy', 'Sunday', 'Brave'];
