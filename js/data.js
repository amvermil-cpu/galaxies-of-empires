// Galaxies of Empires v1.6 — game data (all original names)
'use strict';
const EOG = window.EOG = window.EOG || {};
EOG.VERSION = '3.1';

// v1.3: only Metal and Gas accumulate (plus research points). Energy is a per-planet capacity, not a stockpile.
// v1.4: Gas became Crystal. Metal pays for buildings and defenses; Crystal pays for ships and troops.
EOG.RES = ['metal', 'crystal'];
EOG.RES_ICON = { metal: '⛏', crystal: '💎', rp: '⚗', energy: '⚡' };
EOG.RES_NAME = { metal: 'Metal', crystal: 'Crystal', rp: 'Research', energy: 'Energy' };
EOG.RES_COLOR = { metal: '#d9a066', crystal: '#7fe3ff', rp: '#d59bff', energy: '#ffd84d' };
EOG.TIME_MUL = 2;
EOG.ROUTE_METAL = 0.85; EOG.ROUTE_CRYSTAL = 0.7; // v1.4: each route pays ONE resource the player picks (metal or crystal)
// v1.3: the whole game runs 2× slower than v1.2 (builds, training, research, travel, AI timers)

EOG.PLANET_TYPES = {
  lava:   { name: 'Lava',      color: '#ff6a3d', glow: '#ff3300', tag: '🚀 Shipwright world', desc: '+40% metal, 🚀 +15% ship build speed, +4 energy', metal: 1.4, shipSpeed: 1.15, energy: 4 },
  ice:    { name: 'Ice',       color: '#bfefff', glow: '#7fd8ff', desc: '+20% shield strength, +8 energy (cold-running reactors)', shield: 1.2, energy: 8 },
  gas:    { name: 'Gas Giant', color: '#c9a3ff', glow: '#9a6bff', desc: '+40% crystal, +10% research, +6 energy', crystal: 1.4, rp: 1.1, energy: 6 },
  garden: { name: 'Garden',    color: '#6be08a', glow: '#2fbf5f', desc: '+1 building slot, +30% troop training speed, +10% trade', slots: 1, troopSpeed: 1.3, trade: 1.1, energy: 0 },
  barren: { name: 'Barren',    color: '#b8a78f', glow: '#8a7a66', desc: '+25% research, +20% defense HP, +2 energy', rp: 1.25, defHp: 1.2, energy: 2 },
};

// v1.3 planet bonus types (replace the old specialisations)
EOG.SPECS = {
  trade:      { name: 'Trade',                    icon: '⚖', desc: '+50% trade income, +1 trade route, Trade Center swaps 15% better here' },
  defense:    { name: 'Defense',                  icon: '🛡', desc: '+40% defense HP, +30% garrison strength, +4 turret cap' },
  production: { name: 'Troop & Ship Production',  icon: '⚒', desc: '+30% ship and troop build speed, −15% ship cost' },
  resource:   { name: 'Resource Production',      icon: '⛏', desc: '+30% metal and crystal output, +4 energy' },
};

// Buildings: cost at level 1, scales ×1.55 per level; time ×1.42 per level (× TIME_MUL).
// energy = energy used per level. Power Plants provide energy instead. multi = more than one allowed per planet.
// v1.4: buildings and defenses cost METAL only; any building can be built several times on a planet (slots + energy limit it).
EOG.BUILDINGS = {
  mine:      { name: 'Metal Extractor',   icon: '⛏', cost: { metal: 50 },  time: 18, energy: 2, multi: true, desc: 'Produces metal for buildings and defenses. Each extra copy adds a little less (−15% per copy).' },
  power:     { name: 'Crystal Extractor', icon: '💎', cost: { metal: 70 },  time: 20, energy: 3, multi: true, desc: 'Produces crystal for ships and troops. Stackable with diminishing returns.' },
  plant:     { name: 'Power Plant',       icon: '⚡', cost: { metal: 60 },  time: 16, energy: 0, multi: true, desc: 'Provides +10 energy per level. Every other building uses energy; you can’t build past the planet’s cap.' },
  shipyard:  { name: 'Shipyard',          icon: '🚀', cost: { metal: 160 }, time: 40, energy: 3, multi: true, desc: 'Builds ships. Lv1 Fighters, Transports & Traders · Lv3 Destroyers · Lv10 Warship Carrier · Lv15 Freighter. Every extra Shipyard stacks its full speed bonus. Upgrades speed up batches already in the queue.' },
  lab:       { name: 'Research Lab',      icon: '⚗', cost: { metal: 120 }, time: 35, energy: 3, multi: true, desc: 'Generates research points. Extra labs add a little less each.' },
  barracks:  { name: 'Barracks',          icon: '🪖', cost: { metal: 100 }, time: 30, energy: 2, multi: true, desc: 'Trains infantry. v1.5: every extra Barracks stacks its full speed bonus. Garrisons have no troop cap.' },
  warehouse: { name: 'Logistics Depot',   icon: '📦', cost: { metal: 80 },  time: 25, energy: 1, multi: true, desc: 'v1.5: storage is unlimited, so the old Warehouse became a Depot: +6% metal and crystal output on this planet per level (stacks).' },
  tradeport: { name: 'Trade Center',      icon: '⚖', cost: { metal: 150 }, time: 40, energy: 2, multi: true, desc: 'Swap metal ↔ crystal at a rate that improves with level (2.5:1 at Lv1 → 1.4:1 at Lv10 → 1.15:1 at Lv15). v1.5: each level adds 2–3 trader slots (25 at Lv10) and several Trade Centers on one planet stack their slots. Routes run only between your own Trade Center worlds and can never be attacked.' },
  bunker:    { name: 'Bunker Complex',    icon: '🏰', cost: { metal: 110 }, time: 35, energy: 1, multi: true, desc: 'Fortifications: +15% garrison defense per level. v1.5: every Bunker on a planet stacks in full.' },
  forge:     { name: 'Keelwright Forge',  icon: '🔩', cost: { metal: 240 }, time: 45, energy: 3, multi: true, desc: 'v1.9: ships BUILT on this planet roll out reinforced: +3% hull, shields and damage per Forge level (all Forges here stack, max +75%). The boost is stamped on each ship at launch and shown with a ⬆ badge.' },
  scoutpost: { name: 'Scout Post',        icon: '📡', cost: { metal: 130 }, time: 30, energy: 2, multi: true, desc: 'Scanning station. Reports incoming attacks instantly with ship & troop estimates and win odds; send its scouts to scan enemy planets and fleets. v1.9: scans take ≤1 min at Lv1 and get faster with level (instant from Lv10); low levels give wide ranges, Lv10–14 tight ranges, Lv15 auto-scouts everything with exact numbers.' },
};
EOG.BUILD_MAX_LVL = 15; // v1.6: was 10. Levels 11–15 cost ×1.5 per step (×1.55 before), take ×1.25 per step (×1.42 before) and add the same per-level effects.
EOG.ENERGY_BASE = 12;        // every planet's own energy before Power Plants
EOG.ENERGY_PER_PLANT = 10;   // per Power Plant level
EOG.MULTI_DR = 0.85;         // each extra copy of the same building adds ×0.85 of the previous one
EOG.DEMOLISH_REFUND = 0.4;   // share of the total spent on a building that demolishing gives back

EOG.DEFENSES = {
  shield:  { name: 'Planetary Shield', icon: '◯', cost: { metal: 240 }, time: 35, max: 10, desc: 'Absorbs all damage to turrets and stations until depleted. Regenerates.' },
  turret:  { name: 'Turret Battery',   icon: '✛', cost: { metal: 110 }, time: 20, max: 10, desc: 'Ground-to-orbit guns. Prioritise Transports.' },
  mines:   { name: 'Minefield',        icon: '✳', cost: { metal: 100 }, time: 25, max: 6, desc: 'Damages every attacking ship when it arrives. Recharges in 4 min.' },
  station: { name: 'Orbital Station',  icon: '⬢', cost: { metal: 1400 }, time: 120, max: 2, desc: 'Heavy armed platform in orbit.' },
  laser:   { name: 'Defense Laser',    icon: '🔆', cost: { metal: 8000, crystal: 3500 }, time: 70, max: 5, desc: 'Continuous beam with unlimited battle range. DPS ramps the longer it stays on one target.' },
  railgun: { name: 'Planetary Railgun',icon: '⇉', cost: { metal: 500000, crystal: 80000 }, time: 240, max: 1, desc: 'One per planet. Very powerful, slow shots with unlimited range.' },
};

// Ship roster (v1.3): two warships plus two unarmed hulls. sf = size factor for module strength.
// Fighters are cheap and swarm Destroyers (×1.6 damage against them). Destroyers carry flak: every shot at a fighter
// also bursts into nearby fighters, so massed fighters get shredded. A good fleet mixes both.
// v1.4: ships and troops cost CRYSTAL only.
EOG.HULLS = {
  fighter:   { name: 'Fighter',   short: 'FTR', hp: 90,   slots: 2, sf: 1,   speed: 1.45, range: 90,  size: 6,  cost: { crystal: 37 },  time: 10, yard: 1, role: 'Cheap swarm craft; tears into Destroyers (×3.5).' },
  destroyer: { name: 'Destroyer', short: 'DST', hp: 1100, slots: 6, sf: 5,   speed: 0.9,  range: 170, size: 18, cost: { crystal: 640 }, time: 90, yard: 3, flak: 2, role: 'Heavy warship; flak bursts hit 2+ extra fighters per shot (more against massed swarms).' },
  transport: { name: 'Transport', short: 'TRN', hp: 380,  slots: 1, sf: 1.5, speed: 1.0,  range: 0,   size: 11, cost: { crystal: 120 }, time: 22, yard: 1, cap: 20, noWeapon: true, role: 'Unarmed troop ship. Carries 20 infantry.' },
  trader:    { name: 'Trader',    short: 'TRD', hp: 300,  slots: 1, sf: 1.2, speed: 1.1,  range: 0,   size: 10, cost: { crystal: 100 }, time: 18, yard: 1, noWeapon: true, trader: true, role: 'Unarmed. Runs trade routes and cannot be attacked.' },
  // v1.8 item 2: two late hulls (original designs)
  carrier:   { name: 'Warship Carrier', short: 'CAR', hp: 6000, slots: 10, sf: 9, speed: 0.75, range: 210, size: 30, cost: { crystal: 3000 }, time: 260, yard: 10, travel: 1, volley: 3, role: 'Pure battleship: huge hull, strike wings split each volley over 3 targets, heavy bombardment vs turrets. No troops. Expensive.' },
  freighter: { name: 'Freighter', short: 'FRT', hp: 20000, slots: 2, sf: 1.2, speed: 1.25, range: 100, size: 16, cost: { crystal: 6000 }, time: 400, yard: 15, cap: 1000, travel: 1.25, role: 'Heavy armoured troop ship: carries 1,000 infantry, light guns. Freighter-only fleets travel 25% faster.' },
};
EOG.COMBAT_HULLS = ['fighter', 'destroyer', 'carrier'];
EOG.SMALL_CRAFT = ['fighter', 'transport', 'trader', 'freighter'];
EOG.CAPITAL = ['destroyer', 'carrier'];
// attacker hull → the hull it is strong against (shown in Help/shipyard).
// v1.8 item 4: the counter loop. Fighter > Destroyer (x3.5) · Destroyer > Fighter swarms (flak) and Carrier (x1.25) · Carrier > Fighter (x1.25)
// Freighter guns get x1.25 against unarmed Transports/Traders-class haulers (Transports).
EOG.COUNTERS = { fighter: 'destroyer', destroyer: 'fighter', carrier: 'fighter', freighter: 'transport' };
EOG.RPS_BONUS = 1.25;
EOG.COUNTER_TABLE = { fighter: { destroyer: 3.5 }, destroyer: { carrier: 1.25 }, carrier: { fighter: 1.25 }, freighter: { transport: 1.25 } };
EOG.FLAK_HULLS = { destroyer: 'fighter' };
// v1.9 item 9: bonus damage against planetary defenses (turrets / orbital stations)
EOG.DEF_BONUS = { carrier: { turret: 2.5, station: 1.5 } };
EOG.COUNTER_BONUS = 3.5; EOG.COUNTER_TABLE.fighter.destroyer = EOG.COUNTER_BONUS; EOG.COUNTER_MALUS = 1; EOG.FLAK_SPLASH = 0.3; EOG.FLAK_MASS = 20; EOG.FLAK_MASS_CAP = 3;
EOG.ALL_HULLS = Object.keys(EOG.HULLS);
EOG.BUILD_HULLS = EOG.ALL_HULLS.slice();

EOG.TROOPS = {
  inf:   { name: 'Infantry', short: 'INF', icon: '🪖', atk: 1, def: 1.2, size: 1, cost: { crystal: 18 }, time: 5, barracks: 1 },
};
EOG.TROOP_KEYS = ['inf']; // v1.3: infantry only

// Tech tree: 3 branches, linear within branch
EOG.TECHS = [
  // Defense
  { id: 'd1', br: 'defense', name: 'Hardened Plating',  desc: 'Turret & station HP +25%' },
  { id: 'd2', br: 'defense', name: 'Deflector Theory',  desc: 'Planetary shields +30%' },
  { id: 'd3', br: 'defense', name: 'Smart Mines',       desc: 'Minefield damage +60%' },
  { id: 'd4', br: 'defense', name: 'Bastion Doctrine',  desc: 'Garrison defense +20%' },
  { id: 'd5', br: 'defense', name: 'Point Defense',     desc: 'Turret damage +25%, +2 turret cap' },
  { id: 'd6', br: 'defense', name: 'Orbital Bulwark',   desc: 'Stations +40% HP, +1 station cap' },
  { id: 'd7', br: 'defense', name: 'Rapid Rebuild',     desc: 'Defense build time −40%' },
  { id: 'd8', br: 'defense', name: 'Aegis Lattice',     desc: 'Shield regeneration ×2' },
  { id: 'd9', br: 'defense', name: 'Citadel Protocol',  desc: 'All planet defenses & garrison +25%' },
  // Economy
  { id: 'e1', br: 'economy', name: 'Deep Core Drilling', desc: 'Metal +20%' },
  { id: 'e2', br: 'economy', name: 'Fusion Grids',       desc: 'Energy capacity +25% on every planet' },
  { id: 'e3', br: 'economy', name: 'Deep Crystal Taps',  desc: 'Crystal +20%' },
  { id: 'e4', br: 'economy', name: 'Logistics Network',  desc: 'Building time −10%, metal & crystal +5%' },
  { id: 'e5', br: 'economy', name: 'Merchant Guilds',    desc: 'Trade income +30%, +1 route per planet' },
  { id: 'e6', br: 'economy', name: 'Automated Foundries', desc: 'Building time −20%' },
  { id: 'e7', br: 'economy', name: 'Galactic Exchange',  desc: 'Trade Center swaps 20% better' },
  { id: 'e8', br: 'economy', name: 'Terraforming',       desc: '+1 building slot on every planet' },
  { id: 'e9', br: 'economy', name: 'Golden Age',         desc: 'All production +25%' },
  // Fleet
  { id: 'f1', br: 'fleet', name: 'Pulse Lasers',       desc: 'Ship weapon damage +15%' },
  { id: 'f2', br: 'fleet', name: 'Composite Armor',    desc: 'Ship armor +20%' },
  { id: 'f3', br: 'fleet', name: 'Ion Lances',         desc: 'Destroyer damage +15%' },
  { id: 'f4', br: 'fleet', name: 'Drop Pods',          desc: 'Transport troop capacity +50%, infantry attack +15%' },
  { id: 'f5', br: 'fleet', name: 'Shield Harmonics',   desc: 'Ship shields +25%' },
  { id: 'f6', br: 'fleet', name: 'Flak Directors',     desc: 'Destroyer hull +20%, flak bursts +1 fighter' },
  { id: 'f7', br: 'fleet', name: 'Elite Training',     desc: 'Infantry attack & defense +25%' },
  { id: 'f8', br: 'fleet', name: 'Targeting AI',       desc: 'Ship weapon damage +20%' },
  { id: 'f9', br: 'fleet', name: 'Damage Control',     desc: 'Docked ships repair 3× faster; ships +10% HP' },
];
// research costs research points only (v1.4: no resource cost; nothing raises the system cap — Commander level does)
EOG.TECHS.forEach((t, i) => { t.tier = i % 9; t.cost = Math.round(60 * Math.pow(1.48, t.tier)); t.crystal = 0; });
EOG.TECH_BY_ID = Object.fromEntries(EOG.TECHS.map(t => [t.id, t]));
EOG.BRANCHES = { defense: { name: 'Defense', color: '#6fb3ff' }, economy: { name: 'Economy', color: '#ffd166' }, fleet: { name: 'Fleet', color: '#ff7b7b' } };

EOG.FACTIONS = {
  player:       { name: 'Your Empire',          color: '#38e1ff', short: 'You' },
  raider:       { name: 'Vorrak Marauders',     color: '#ff4d4d', short: 'Vorrak', desc: 'Raiders. Hunt trade lanes and weak worlds.' },
  expansionist: { name: 'Solenne Dominion',     color: '#ffa53d', short: 'Solenne', desc: 'Expansionists. Grab neutral worlds fast.' },
  trader:       { name: 'Kessari Compact',      color: '#c77dff', short: 'Kessari', desc: 'Traders. Wary, well-defended; open to trade until provoked.' },
  warlord:      { name: 'Thyrax Ascendancy',    color: '#ff2fa0', short: 'Thyrax', desc: 'Warlords. Few worlds, huge siege fleets, relentless.' },
  turtle:       { name: 'Ordane Bastion',       color: '#4fd0a8', short: 'Ordane', desc: 'Isolationists. Fortress worlds; at peace unless provoked.' },
  swarm:        { name: 'Imeris Collective',    color: '#e8e34a', short: 'Imeris', desc: 'A hive of cheap fast ships and endless troops.' },
  scholar:      { name: 'Quillon Synod',        color: '#6fa8ff', short: 'Quillon', desc: 'Scholars. Out-tech everyone; peaceful until provoked.' },
  syndicate:    { name: 'Dravenne Syndicate',   color: '#b8865a', short: 'Dravenne', desc: 'Smugglers. Raid lanes with light, fast wings.' },
  ally1:        { name: 'Aurel League',         color: '#5cf2a0', short: 'Aurel', desc: 'Your ally. Expands, defends and sends help.' },
  ally2:        { name: 'Teshan Accord',        color: '#9ad7ff', short: 'Teshan', desc: 'Your ally. Expands, defends and sends help.' },
  ally3:        { name: 'Mireval Covenant',     color: '#f6c1ff', short: 'Mireval', desc: 'Your ally. Expands, defends and sends help.' },
  neutral:      { name: 'Independent',          color: '#9aa4b2', short: 'Indep.' },
  crisis:       { name: 'The Hollow',           color: '#7dff6b', short: 'Hollow', desc: 'Something old wakes beyond the Rift.' },
};
// Rival empires in the order they are added when you pick an empire count (1-8).
EOG.RIVALS = ['raider', 'expansionist', 'trader', 'warlord', 'turtle', 'swarm', 'scholar', 'syndicate'];
EOG.ALLIES = ['ally1', 'ally2', 'ally3']; // v1.4: computer allies on your team
EOG.AI_FACTIONS = EOG.RIVALS.slice(0, 3); // default (v1.0) set; the live list is state.rivals
// Personality knobs. peaceful = at peace (and a trade partner) until you attack them.
EOG.PERS = {
  raider:       { expand: 420, raid: true,  aggressive: true, troopP: 0.45, waveMult: 1.0,  base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 1]], spec: 'production',    def: [2, 3, 1], garrison: [40, 8] },
  expansionist: { expand: 220, aggressive: true, troopP: 0.7,  waveMult: 1.0,  base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 3], ['warehouse', 2], ['lab', 1]], spec: 'defense', def: [2, 3, 1], garrison: [40, 8] },
  trader:       { expand: 600, peaceful: true,  troopP: 0.45, waveMult: 1.0,  base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 1], ['tradeport', 3]], spec: 'trade', def: [3, 5, 1], garrison: [40, 8] },
  warlord:      { expand: 380, aggressive: true, troopP: 0.6,  waveMult: 1.25, base: [['mine', 3], ['plant', 2], ['power', 3], ['shipyard', 4], ['barracks', 3], ['warehouse', 2]], spec: 'production', def: [2, 3, 1], garrison: [40, 10] },
  turtle:       { expand: 700, peaceful: true,  troopP: 0.3,  waveMult: 0.8,  base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 2], ['barracks', 3], ['warehouse', 2], ['bunker', 3]], spec: 'defense', def: [4, 6, 2], garrison: [60, 12] },
  swarm:        { expand: 300, aggressive: true, troopP: 0.85, waveMult: 0.9,  hulls: ['fighter'], base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 4], ['warehouse', 2]], spec: 'production', def: [1, 2, 0], garrison: [70, 4] },
  scholar:      { expand: 520, peaceful: true,  troopP: 0.4,  waveMult: 0.85, techBoost: 1.5, base: [['mine', 2], ['plant', 3], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 3]], spec: 'defense', def: [3, 4, 1], garrison: [40, 8] },
  ally1:        { expand: 420, ally: true, troopP: 0.5, waveMult: 0.8, base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 1]], spec: 'production', def: [2, 3, 1], garrison: [40, 8] },
  ally2:        { expand: 420, ally: true, troopP: 0.5, waveMult: 0.8, base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 1]], spec: 'defense', def: [2, 3, 1], garrison: [40, 8] },
  ally3:        { expand: 420, ally: true, troopP: 0.5, waveMult: 0.8, base: [['mine', 3], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['lab', 1]], spec: 'resource', def: [2, 3, 1], garrison: [40, 8] },
  syndicate:    { expand: 480, raid: true, aggressive: true, troopP: 0.3, waveMult: 0.7, base: [['mine', 2], ['plant', 2], ['power', 2], ['shipyard', 3], ['barracks', 2], ['warehouse', 2], ['tradeport', 2]], spec: 'trade', def: [2, 3, 1], garrison: [36, 6] },
};

// Map sizes: n systems; the world grows with n. travel: fleet speed multiplier (bigger maps move faster so crossing
// the galaxy stays a few minutes), crisis: wave-strength multiplier, waves: Hollow waves, share: systems needed to win,
// time: multiplier on when the Rift opens (bigger galaxies get more time to expand).
EOG.SIZES = {
  small:  { name: 'Small',  n: 72,  travel: 1.0,  crisis: 1.0,  waves: 8,  share: 0.40, time: 1.0,  blurb: '72 systems · classic' },
  medium: { name: 'Medium', n: 96,  travel: 1.35, crisis: 1.4,  waves: 9,  share: 0.34, time: 1.2,  blurb: '96 systems' },
  large:  { name: 'Large',  n: 120, travel: 1.7,  crisis: 1.9,  waves: 10, share: 0.28, time: 1.4,  blurb: '120 systems' },
  huge:   { name: 'Huge',   n: 150, travel: 2.1,  crisis: 2.5,  waves: 12, share: 0.22, time: 1.65, blurb: '150 systems' },
  massive: { name: 'Massive', n: 250, travel: 2.7, crisis: 3.2,  waves: 12, share: 0.2,  time: 1.82, blurb: '250 systems · 8 rivals', rivals: 8 }, // v2.1 item 9 (sizetest: passes at 4× throttle)
  galactic: { name: 'Galactic', n: 400, travel: 3.4, crisis: 4.0, waves: 12, share: 0.18, time: 2.0, blurb: '400 systems · 8 rivals', rivals: 8 }, // v2.2 item 9: passed perf (pan 60 fps, fit 57 fps, close 26 fps at 4× throttle; sim step avg 1.15 ms)
};

EOG.DIFFICULTY = {
  // v1.3: all timers ×2 (4 min/tile travel): the scripted bot wins a clear majority of Normal games, nearly all Easy games and a minority of Hard ones.
  easy:   { name: 'Easy',   aiEco: 0.38, wave: 0.25, crisisAt: 220 * 60, crisisMult: 0.25, waveEvery: 18 * 60,   firstWave: 44 * 60, shareMul: 0.6 },
  normal: { name: 'Normal', aiEco: 0.58, wave: 0.48, crisisAt: 200 * 60, crisisMult: 0.52, waveEvery: 14 * 60,   firstWave: 32 * 60, shareMul: 0.84 },
  hard:   { name: 'Hard',   aiEco: 0.66, wave: 0.50, crisisAt: 180 * 60,  crisisMult: 0.55, waveEvery: 11 * 60, firstWave: 24 * 60, shareMul: 0.95 },
};
EOG.CRISIS_WAVE_GAP = 6 * 60;

// ---- v1.4: species (picked at setup) ----
EOG.SPECIES = {
  // v1.8 item 6: three original starting species, one small bonus each. 'none' = balanced (migrated v1.7 saves).
  forgeborn: { name: 'Forgeborn', icon: '🔨', desc: 'Buildings finish 20% faster', buildSpeed: 1.25, look: 'human', capital: 'Anvil', fleet: ['Anvil', 'Hammer', 'Bastion', 'Rivet', 'Keel', 'Foundry'], hull: '#ffd9a8', accent: '#ffae42' },
  skyrunner: { name: 'Skyrunners', icon: '🪽', desc: 'Fleets travel 15% faster', shipSpeed: 1.15, look: 'alien', capital: 'Aerie', fleet: ['Swift', 'Gale', 'Comet', 'Kestrel', 'Zephyr', 'Drift'], hull: '#b6ff9e', accent: '#c46bff' },
  veyari:    { name: 'Veyari Guild', icon: '⚖️', desc: '+20% trade route income', trade: 1.2, look: 'human', capital: 'Exchange', fleet: ['Ledger', 'Caravel', 'Tally', 'Marque', 'Charter', 'Coin'], hull: '#cfe6ff', accent: '#38e1ff' },
  none:      { name: 'Balanced', icon: '◎', desc: 'No species bonus', look: 'human', capital: 'Prime', fleet: ['Vanguard', 'Lancer', 'Bastion', 'Aegis', 'Talon', 'Meridian'], hull: '#cfe6ff', accent: '#38e1ff', hidden: true },
};
EOG.PICK_SPECIES = ['forgeborn', 'skyrunner', 'veyari'];
// ---- v1.4: Commander level (from kills) sets the system cap ----
EOG.CMD_CAP_BASE = 10; EOG.CMD_CAP_MAX = 50;
EOG.cmdXpFor = lv => Math.round(60 * Math.pow(lv, 1.55)); // XP needed to go from lv to lv+1
// ---- v1.4: Endless mode stages ----
EOG.ENDLESS_STAGES = [{ n: 20, rivals: 1 }, { n: 40, rivals: 2 }, { n: 80, rivals: 4 }, { n: 160, rivals: 8 }];
EOG.HOP_TIME = 180;     // v1.5: 3 game-minutes per tile (was 4) (lane hop) at 1x; the arrival-speed slider can only slow fleets
EOG.ATTACK_WINDOW = 30; // seconds of game time a battle stays open for reinforcements
EOG.SCOUT_RANGE = 260;  // map px: a scout this close to an incoming fleet reveals it

EOG.PREMISE = 'Three centuries after the Lantern Gates went dark, the hyperlanes of the Cindral Expanse have flickered back to life. ' +
  'Your colony has a single world and a dream of empire. The Vorrak Marauders, the Solenne Dominion and the Kessari Compact want the same lanes — ' +
  'and the old star charts warn that whatever sealed the Gates is still waiting beyond the Rift.';
