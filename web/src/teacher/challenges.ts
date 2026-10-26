/**
 * Challenge sheets: Ms. Nova hands out a new one at the start of every live class.
 * Written by hand (not generated) so every step matches the real app and is safe.
 * Order = difficulty: early ones use Drive, later ones Code, Teach, Train and Try it.
 */

export type ChallengeKind =
  | 'drive'
  | 'code'
  | 'teach'
  | 'train'
  | 'quiz'
  | 'camera'
  | 'design'
  | 'science'
  | 'pioneer'
  | 'safety'
  | 'explain'
  | 'hunt';

export const KIND_LABEL: Record<ChallengeKind, string> = {
  drive: '🕹️ Drive',
  code: '🧩 Code',
  teach: '🪞 Teach',
  train: '🧠 AI training',
  quiz: '❓ Quiz',
  camera: '📷 Camera',
  design: '✏️ Design on paper',
  science: '🔬 Experiment',
  pioneer: '👩‍🔬 Robot pioneers',
  safety: '🦺 Safety inspector',
  explain: '🗣️ Teach it back',
  hunt: '🔎 Robot hunt',
};

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  /** Said when the learner gets it right. */
  why: string;
}

export interface Challenge {
  id: string;
  title: string;
  icon: string;
  /** What kind of challenge it is (each class brings a different kind from the last one). */
  kind: ChallengeKind;
  /** Where to start in the app, if it uses the app. */
  tab?: 'connect' | 'drive' | 'code' | 'teach' | 'train' | 'run';
  /** Quiz challenges: each question is one step, ticked when answered right. */
  quiz?: QuizQuestion[];
  goal: string;
  needs: string[];
  steps: string[];
  tips: string[];
  /** Extra challenge for Builders and Engineers. */
  bonus: string;
  badge: string;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'robot-wave',
    kind: 'drive',
    title: 'Robot Wave',
    icon: '👋',
    tab: 'drive',
    goal: 'Make Pip wave hello three times.',
    needs: ['The follower arm (real or pretend)'],
    steps: [
      'Connect the follower and turn its motors on (Connect tab), or use a pretend arm.',
      'Open the Drive tab and press the "Wave up" pose button.',
      'Use the − and + buttons on Wrist tilt to wave down and up.',
      'Wave three times, then press "Home".',
    ],
    tips: ['Start on 🐢 slow speed.', 'Hands clear, then press go!'],
    bonus: 'Can you make the wave look happier by also opening and closing the hand?',
    badge: '👋 Friendly Robot',
  },
  {
    id: 'quiz-joints',
    kind: 'quiz',
    title: 'Robot Joints Quiz',
    icon: '❓',
    goal: 'Answer 4 questions about how Pip moves.',
    needs: ['Just you!'],
    steps: ['Question 1', 'Question 2', 'Question 3', 'Question 4'],
    quiz: [
      { q: 'How many joints does Pip have?', options: ['3', '6', '10'], answer: 1, why: 'Base spin, shoulder, elbow, wrist tilt, wrist spin and the hand.' },
      { q: 'What does 0° mean for a joint?', options: ['It is broken', 'It is in the middle', 'It is all the way up'], answer: 1, why: 'Zero degrees is the middle, and the numbers go up one way and down the other.' },
      { q: 'Which button stops the robot right away?', options: ['Home', 'STOP', 'Copy me'], answer: 1, why: 'The big red STOP button (or the Esc key) stops the arm any time.' },
      { q: 'Which arm do YOU move with your hand?', options: ['The leader', 'The follower', 'Both'], answer: 0, why: 'You move the leader, and the follower copies it.' },
    ],
    tips: ['No rush. Think, then pick!'],
    bonus: 'Make up your own quiz question about robots and ask Ms. Nova.',
    badge: '❓ Quiz Whiz',
  },
  {
    id: 'joint-detective',
    kind: 'science',
    title: 'Joint Detective',
    icon: '🔍',
    tab: 'drive',
    goal: 'Find out how far each joint can turn, and write it down.',
    needs: ['The follower arm (real or pretend)', 'Paper and pencil (or the notes box below)'],
    steps: [
      'Open the Drive tab.',
      'Slide Base spin all the way left, then all the way right. Write down both numbers.',
      'Do the same for Shoulder and Elbow.',
      'Which joint turns the farthest? Write your answer.',
    ],
    tips: ['Move slowly near the ends.', 'Degrees tell you how far a joint turned. 0° is the middle.'],
    bonus: 'Add up the left and right numbers to get each joint’s total range.',
    badge: '🔍 Joint Detective',
  },
  {
    id: 'design-helper',
    kind: 'design',
    title: 'Design a Helper Robot',
    icon: '✏️',
    goal: 'Draw a robot that helps someone, on paper.',
    needs: ['Paper', 'Pencils or crayons'],
    steps: [
      'Pick who your robot helps (a pet, a grandparent, a doctor, the planet...).',
      'Draw your robot. Give it at least one arm!',
      'Label 3 parts: what it uses to sense, to think, and to move.',
      'Tell Ms. Nova about your robot in the chat.',
    ],
    tips: ['Every real robot started as a drawing.'],
    bonus: 'Which of your robot’s jobs could Pip do already?',
    badge: '✏️ Robot Designer',
  },
  {
    id: 'pose-show',
    kind: 'drive',
    title: 'Pose Show',
    icon: '🕺',
    tab: 'drive',
    goal: 'Invent your own robot pose and give it a name.',
    needs: ['The follower arm (real or pretend)'],
    steps: [
      'Open the Drive tab and press "Home".',
      'Use at least 3 different joint sliders to make a new pose.',
      'Look at the 3D view: does it look how you imagined?',
      'Give your pose a name and write it in your notes.',
    ],
    tips: ['Try copying an animal: a giraffe, a swan, a crab!'],
    bonus: 'Write down every joint’s angle so someone else could copy your pose exactly.',
    badge: '🕺 Pose Designer',
  },
  {
    id: 'safety-inspector',
    kind: 'safety',
    title: 'Safety Inspector',
    icon: '🦺',
    goal: "Check Pip's workspace like a real robot safety inspector.",
    needs: ['Your robot desk'],
    steps: [
      'Is there a clear space around the follower arm (no cups, cables or fingers)?',
      'Find the STOP button on the screen and the follower’s power plug.',
      'Is the speed set to 🐢 slow for first tries?',
      'Tell Ms. Nova one safety rule you will always follow.',
    ],
    tips: ['Real robot factories check safety every day.'],
    bonus: 'Make a small "Robot zone" sign for your desk.',
    badge: '🦺 Safety Inspector',
  },
  {
    id: 'code-dance',
    kind: 'code',
    title: 'Code a Dance',
    icon: '💃',
    tab: 'code',
    goal: 'Use blocks to make Pip dance.',
    needs: ['The follower arm (real or pretend)'],
    steps: [
      'Open the Code tab and pick "Robot dance" from "Start from".',
      'Press ▶ Go and watch which block lights up.',
      'Change one number in a "move" block and press Go again.',
      'Add one more move inside the "repeat" block.',
    ],
    tips: ['The block that lights up is the one running right now.'],
    bonus: 'Use "set speed" to make the dance start slow and finish fast.',
    badge: '💃 Dance Coder',
  },
  {
    id: 'camera-spy',
    kind: 'camera',
    title: 'Robot Eye Spy',
    icon: '📷',
    tab: 'drive',
    goal: "See the world through Pip's camera and find 3 things.",
    needs: ['The wrist camera', 'The follower arm'],
    steps: [
      'Turn the camera on in the Camera box (under the 3D view).',
      'Use Drive to point the camera at something blue.',
      'Now point it at something soft.',
      'Point it at the table. How far away does it look?',
    ],
    tips: ['Move slowly so the picture stays clear.', 'Only point the camera at things, never at people without asking.'],
    bonus: 'Why do robots need cameras? Write one idea in your notes.',
    badge: '📷 Robot Eye',
  },
  {
    id: 'countdown',
    kind: 'code',
    title: 'Countdown Bow',
    icon: '⏱️',
    tab: 'code',
    goal: 'Make Pip count down with waits, then take a bow.',
    needs: ['The follower arm (real or pretend)'],
    steps: [
      'Open the Code tab and pick "Start from scratch".',
      'Snap three "wait 1 seconds" blocks under "when ▶ Go is pressed".',
      'Add "strike a pose: Take a bow", then "go home".',
      'Press ▶ Go and count down out loud with Pip!',
    ],
    tips: ['Blocks run from top to bottom.'],
    bonus: 'Between each wait, open and close the hand like a blinking light.',
    badge: '⏱️ Timing Pro',
  },
  {
    id: 'pioneers',
    kind: 'pioneer',
    title: 'Robot Pioneers',
    icon: '👩‍🔬',
    goal: 'Meet women who build robots and AI.',
    needs: ['Ms. Nova in the chat'],
    steps: [
      'Ask Ms. Nova: "Who is Ayanna Howard?"',
      'Ask about one more: Cynthia Breazeal, Daniela Rus or Fei-Fei Li.',
      'Write one cool thing each of them did in your notes.',
      'Which one would you like to meet? Why?',
    ],
    tips: ['Lots of robots you know were made by teams with women engineers.'],
    bonus: 'Imagine it’s 20 years from now. What robot have YOU built?',
    badge: '👩‍🔬 Future Pioneer',
  },
  {
    id: 'air-square',
    kind: 'code',
    title: 'Draw a Square in the Air',
    icon: '🟪',
    tab: 'code',
    goal: 'Program the hand to trace a square in the air.',
    needs: ['The follower arm (real or pretend)'],
    steps: [
      'Open the Code tab and start from scratch.',
      'Use "move Base spin" to go left and right, and "move Shoulder" to go up and down.',
      'Put four moves in order: left, up, right, down.',
      'Press ▶ Go and watch the 3D view. Is it a square?',
    ],
    tips: ['Small angles like 20° make a neat square.'],
    bonus: 'Put your four moves inside a "repeat 3 times" block.',
    badge: '🟪 Shape Artist',
  },
  {
    id: 'copycat',
    kind: 'teach',
    title: 'Copycat Champion',
    icon: '🪞',
    tab: 'teach',
    goal: 'Make the follower copy three poses you do with the leader.',
    needs: ['Both arms connected (or two pretend arms)'],
    steps: [
      'Open the Teach tab and press "Start Copy me".',
      'Move the leader slowly into a pose and watch the follower copy it.',
      'Do two more different poses.',
      'Squeeze the thumb to close the follower’s hand, then let go to open it.',
    ],
    tips: ['Slow and smooth moves copy best.', 'Open "Is it copying?" to see the numbers.'],
    bonus: 'Can you write your name in the air with the follower’s hand?',
    badge: '🪞 Copycat Champion',
  },
  {
    id: 'grip-experiment',
    kind: 'science',
    title: 'Grip Experiment',
    icon: '🧪',
    tab: 'drive',
    goal: 'Find out which soft things Pip can hold.',
    needs: ['The follower arm', '3 soft, light things (pom-pom, sponge, paper ball)'],
    steps: [
      'Guess first: which one will be easiest to hold? Write it in your notes.',
      'Use Drive: open the hand, place a thing between the jaws, then press Close.',
      'Does it hold, slip, or squish? Write it down for each thing.',
      'Was your guess right?',
    ],
    tips: ['Only soft, light things.', 'Keep fingers out of the jaws.'],
    bonus: 'What makes something easy for a robot to grip? Shape? Size? Softness?',
    badge: '🧪 Grip Scientist',
  },
  {
    id: 'pompom',
    kind: 'teach',
    title: 'Pom-pom Pickup',
    icon: '🧶',
    tab: 'teach',
    goal: 'Use the leader arm to pick up a pom-pom and drop it in a cup.',
    needs: ['Both arms connected', 'A soft pom-pom or cotton ball', 'A paper cup'],
    steps: [
      'Put the pom-pom and the cup in front of the follower.',
      'Open the Teach tab and press "Start Copy me".',
      'Open the hand, move down, and squeeze the thumb to grab the pom-pom.',
      'Lift it, move over the cup, and let go!',
    ],
    tips: ['Only use soft, light things.', 'Keep your hands away from the follower while it moves.'],
    bonus: 'Time yourself. Can you do it in under 20 seconds?',
    badge: '🧶 Gentle Gripper',
  },
  {
    id: 'three-demos',
    kind: 'teach',
    title: 'Three Perfect Demos',
    icon: '🎬',
    tab: 'teach',
    goal: 'Record three neat demos of the same task for the robot brain.',
    needs: ['Both arms connected (or two pretend arms)'],
    steps: [
      'Open the Teach tab and type a task name, like "wave".',
      'Press "Start Copy me", then ⏺ Record.',
      'Do the task slowly, then press 💾 Save.',
      'Start from the same spot and record two more.',
    ],
    tips: ['Good demos are slow, smooth and start from the same place.'],
    bonus: 'Watch your demos with ▶️ Replay. Delete any messy one and record a better one.',
    badge: '🎬 Demo Director',
  },
  {
    id: 'teach-back',
    kind: 'explain',
    title: 'Teach Ms. Nova',
    icon: '🗣️',
    goal: 'Be the teacher! Explain how robots learn.',
    needs: ['Ms. Nova in the chat'],
    steps: [
      'In the chat, explain what a "demo" is, in your own words.',
      'Explain how the robot brain learns from demos.',
      'Ask Ms. Nova if you got it right.',
      'Explain it to someone at home too!',
    ],
    tips: ['If you can explain it, you really understand it.'],
    bonus: 'Use an example from your life, like learning to ride a bike.',
    badge: '🗣️ Robot Teacher',
  },
  {
    id: 'first-brain',
    kind: 'train',
    title: 'Train Your First Brain',
    icon: '🧠',
    tab: 'train',
    goal: 'Train a robot brain from your demos and watch it learn.',
    needs: ['At least 3 demos of one task'],
    steps: [
      'Open the Train tab and pick your task.',
      'Choose "Quick" and press "Start learning".',
      'Watch the mistakes line go down.',
      'Go to Try it and press 🚀 Go to see your brain move Pip.',
    ],
    tips: ['More good demos make a smarter brain.'],
    bonus: 'Train again with "Better". Are the mistakes lower than with "Quick"?',
    badge: '🧠 Brain Builder',
  },
  {
    id: 'scientist',
    kind: 'science',
    title: 'Scientist Test',
    icon: '🔬',
    tab: 'run',
    goal: 'Test your robot brain 10 times and find its success rate.',
    needs: ['A trained brain'],
    steps: [
      'Open the Try it tab and pick your brain.',
      'Press 🚀 Go and watch closely.',
      'Press 👍 or 👎 after each try.',
      'Do 10 tries and read your success rate.',
    ],
    tips: ['Scientists change only one thing at a time.'],
    bonus: 'Add 2 more demos, train again, and test 10 more times. Did the success rate go up?',
    badge: '🔬 Robot Scientist',
  },
  {
    id: 'robot-hunt',
    kind: 'hunt',
    title: 'Physical AI Hunt',
    icon: '🔎',
    goal: 'Find robots and smart machines around you.',
    needs: ['Your home or classroom'],
    steps: [
      'Find one machine that moves by itself (a washing machine, a fan, a car wash...).',
      'Find one machine that senses something (a door that opens, a thermostat, a phone).',
      'Does any of them sense AND move? That is physical AI!',
      'Write your finds in your notes and tell Ms. Nova.',
    ],
    tips: ['Physical AI means AI that senses and moves in the real world.'],
    bonus: 'Draw how one of your machines could become smarter.',
    badge: '🔎 Robot Hunter',
  },
  {
    id: 'own-challenge',
    kind: 'design',
    title: 'Invent a Challenge',
    icon: '💡',
    tab: 'drive',
    goal: 'Make up your own robot challenge and try it.',
    needs: ['Your imagination!'],
    steps: [
      'Think of something helpful or fun Pip could do.',
      'Write the goal and three steps in your notes.',
      'Try it with Drive, Code or Copy me.',
      'Tell Ms. Nova how it went!',
    ],
    tips: ['Great robot ideas often help someone.'],
    bonus: 'Swap challenges with a friend and try each other’s.',
    badge: '💡 Inventor',
  },
];

// ---- progress (kept only in this browser) ---------------------------------------

export interface ChallengeProgress {
  version: 1;
  /** Challenge handed out in the most recent class. */
  current: string | null;
  done: string[];
  /** Ticked steps per challenge. */
  ticks: Record<string, number[]>;
  notes: Record<string, string>;
  classes: number;
}

export const CHALLENGE_KEY = 'grip.challenges';

export function loadChallenges(): ChallengeProgress {
  try {
    const v = JSON.parse(localStorage.getItem(CHALLENGE_KEY) ?? 'null');
    if (v && v.version === 1 && Array.isArray(v.done)) return v as ChallengeProgress;
  } catch {
    /* fall through */
  }
  return { version: 1, current: null, done: [], ticks: {}, notes: {}, classes: 0 };
}

export function saveChallenges(p: ChallengeProgress) {
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(p));
  } catch {
    /* fine */
  }
}

export const challengeById = (id: string | null) => CHALLENGES.find((c) => c.id === id) ?? null;

/**
 * A new class = a new challenge: the next one (in order) that isn't done and isn't the
 * one from last class. When every challenge is done, they come round again.
 */
export function nextChallenge(p: ChallengeProgress): Challenge {
  const last = challengeById(p.current);
  const start = Math.max(0, CHALLENGES.findIndex((c) => c.id === p.current) + 1);
  const ordered = Array.from({ length: CHALLENGES.length }, (_, k) => CHALLENGES[(start + k) % CHALLENGES.length]);
  const fresh = ordered.filter((c) => !p.done.includes(c.id) && c.id !== p.current);
  // A different KIND of challenge from last class (not always blocks), then any not done yet.
  return fresh.find((c) => c.kind !== last?.kind) ?? fresh[0] ?? ordered.find((c) => c.kind !== last?.kind) ?? ordered[0];
}
