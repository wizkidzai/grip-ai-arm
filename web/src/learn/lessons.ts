/**
 * GRIP Academy content: the story intro and the classes (lessons).
 *
 * Each scene is one "shot" of a cutscene: an animated picture (`art`), a caption that
 * is read aloud, and an optional "go deeper" note for older learners.
 * Each class ends with a mission done in the real app; `checks` are detected
 * automatically (see MissionSignals) so the class completes by itself.
 */

export type Level = 'explorer' | 'builder' | 'engineer';

export const LEVELS: Record<Level, { label: string; ages: string; icon: string; blurb: string }> = {
  explorer: { label: 'Explorer', ages: '8–10', icon: '🧭', blurb: 'Short and playful' },
  builder: { label: 'Builder', ages: '11–13', icon: '🛠️', blurb: 'Missions + how it works' },
  engineer: { label: 'Engineer', ages: '14–17', icon: '🚀', blurb: 'Deeper ideas and real numbers' },
};

export type Art =
  | 'maya-hello'
  | 'delivery'
  | 'stats'
  | 'why'
  | 'role-models'
  | 'grip'
  | 'class-map'
  | 'joints'
  | 'safety'
  | 'dial'
  | 'poses'
  | 'blocks'
  | 'loop'
  | 'leader-follower'
  | 'demos'
  | 'brain'
  | 'trials'
  | 'graduation';

export interface Scene {
  art: Art;
  caption: string;
  /** Extra explanation for Builders and Engineers. */
  deeper?: string;
  /** Shown only to Engineers. */
  engineer?: string;
  /** How long the scene stays up when not narrated (ms). */
  ms?: number;
}

/**
 * Girls' and women's share at each stage, with the published source for each number.
 * Checked 2026-10-25. The two school numbers come from small regional surveys, so the
 * narration says "about". Replace them if FIRST publishes national participation data.
 */
export const GIRLS_IN_ROBOTICS = [
  {
    stage: "Kids' robot teams",
    share: 34,
    detail: 'About 1 in 3 on FIRST LEGO League teams (ages 9 to 14)',
    source: 'ColoradoFIRST survey of 149 FLL members, 2013',
    url: 'https://legacy.coloradofirst.org/wp-content/uploads/2019/01/ColoradoFIRST-Program-Transitional-Analysis-Final-Paper.pdf',
  },
  {
    stage: 'Teen robot teams',
    share: 30,
    detail: 'About 3 in 10 on high school FIRST Robotics teams',
    source: 'Survey of 56 Pacific Northwest FRC teams, 2016',
    url: 'https://www.ladiesinfirst.com/blogs/frc-female-involvement',
  },
  {
    stage: 'Engineering degrees',
    share: 23,
    detail: 'About 1 in 4 new engineering degrees in the U.S.',
    source: 'NCES data via the Society of Women Engineers, 2021',
    url: 'https://swe.org/research/2024/degree-attainment/',
  },
  {
    stage: 'Robotics jobs',
    share: 16,
    detail: 'About 1 in 6 people in U.S. robotics and engineering jobs',
    source: 'National Girls Collaborative Project, via GBH News, 2025',
    url: 'https://www.wgbh.org/news/local/2025-05-19/women-make-up-just-16-of-the-robotics-field-massrobotics-wants-to-change-that',
  },
];

/** Where the role-model facts come from (checked 2026-10-25). */
export const ROLE_MODEL_SOURCES = [
  { name: 'Ayanna Howard', url: 'https://engineering.osu.edu/about/about-dean-ayanna-howard' },
  { name: 'Cynthia Breazeal', url: 'https://en.wikipedia.org/wiki/Cynthia_Breazeal' },
  { name: 'Daniela Rus', url: 'https://en.wikipedia.org/wiki/Daniela_Rus' },
  { name: 'Fei-Fei Li', url: 'https://learning.acm.org/techtalks/ImageNet' },
];

export const STORY: Scene[] = [
  {
    art: 'maya-hello',
    caption: "Meet Maya. She's ten, she loves taking things apart, and she always asks how things work.",
  },
  {
    art: 'delivery',
    caption:
      'One day a big box arrives. Inside are two robot arms! The strong one is Pip. The other one is the controller Maya moves with her hand.',
  },
  {
    art: 'stats',
    caption:
      "Here's something surprising. On kids' robot teams, only about one in three members are girls. On teen teams, it's about three in ten. And in robotics jobs, only about one in six people are women.",
    deeper: 'Each number comes from a published study or survey. The sources are on the card. The school numbers come from small surveys, so they are a rough picture.',
    ms: 12000,
  },
  {
    art: 'why',
    caption:
      "Why? It's not because girls can't. Often nobody shows them how, and they rarely see people like them building robots.",
  },
  {
    art: 'role-models',
    caption:
      'But many women are building the future of robots and AI, like Ayanna Howard, Cynthia Breazeal, Daniela Rus and Fei-Fei Li.',
    deeper:
      "Ayanna Howard builds robots that help children. Cynthia Breazeal created some of the first social robots. Daniela Rus leads MIT's AI lab. Fei-Fei Li helped computers learn to see.",
    ms: 11000,
  },
  {
    art: 'grip',
    caption:
      "That's why GRIP exists: to help girls learn robotics and physical AI by doing it, with a real robot arm, at your own pace.",
    deeper: 'Physical AI means AI that senses and moves in the real world, not just on a screen.',
  },
  {
    art: 'class-map',
    caption:
      "Maya's mission is to teach Pip, one class at a time. Each class has a short video and a mission. Ready to join her?",
  },
];

export interface Lesson {
  id: string;
  title: string;
  icon: string;
  badge: string;
  scenes: Scene[];
  /** Recorded how-to video in public/videos (made by `npm run videos`). */
  video: 'connect' | 'drive' | 'code' | 'teach' | 'train';
  mission: {
    tab: 'connect' | 'drive' | 'code' | 'teach' | 'train' | 'run';
    intro: string;
    steps: { text: string; check: CheckId }[];
  };
}

export type CheckId =
  | 'followerReady'
  | 'stopPressed'
  | 'drove'
  | 'programFinished'
  | 'copied'
  | 'recorded'
  | 'trained'
  | 'skillRun';

export const LESSONS: Lesson[] = [
  {
    id: 'meet',
    video: 'connect',
    title: 'Meet Pip & stay safe',
    icon: '👋',
    badge: '🛡️ Safety Star',
    scenes: [
      {
        art: 'joints',
        caption: 'Pip has six joints, like you: a base that spins, a shoulder, an elbow, a wrist that tilts, a wrist that spins, and a hand.',
        engineer: 'Each joint is a servo motor with a sensor that measures its angle 4096 steps per turn.',
        ms: 10000,
      },
      {
        art: 'safety',
        caption: 'Robot rule number one: hands clear, then press go. Rule number two: the big red STOP button is your friend. Press it any time!',
      },
    ],
    mission: {
      tab: 'connect',
      intro: 'Connect Pip (a pretend arm is fine), then find the STOP button and press it.',
      steps: [
        { text: 'Connect the follower arm (real or pretend)', check: 'followerReady' },
        { text: 'Press the big red STOP button', check: 'stopPressed' },
      ],
    },
  },
  {
    id: 'drive',
    video: 'drive',
    title: 'Move and wave',
    icon: '🕹️',
    badge: '🕹️ Pilot',
    scenes: [
      {
        art: 'dial',
        caption: 'Robots move in degrees. Zero is the middle. Turn one way and the number goes up, the other way and it goes down.',
        deeper: 'A full circle is 360 degrees. Most of Pip’s joints can turn about 100 degrees each way.',
      },
      {
        art: 'poses',
        caption: 'A pose is every joint in one position at the same time, like freezing in a dance move.',
      },
    ],
    mission: {
      tab: 'drive',
      intro: 'On the Drive tab, turn on the motors and try some poses: wave, take a bow!',
      steps: [{ text: 'Drive Pip: press a pose button or move a slider', check: 'drove' }],
    },
  },
  {
    id: 'code',
    video: 'code',
    title: 'Code with blocks',
    icon: '🧩',
    badge: '🧩 Coder',
    scenes: [
      {
        art: 'blocks',
        caption: 'Code is a list of instructions. Snap blocks together and Pip does them one after another, from top to bottom.',
      },
      {
        art: 'loop',
        caption: "A repeat block does something again and again, so you don't have to write it ten times.",
        engineer: 'Behind the scenes your blocks become a list of commands, and every command passes the same safety limits.',
      },
    ],
    mission: {
      tab: 'code',
      intro: 'On the Code tab, pick "Wave hello" (or build your own) and press Go.',
      steps: [{ text: 'Run a block program to the end', check: 'programFinished' }],
    },
  },
  {
    id: 'teach',
    video: 'teach',
    title: 'Teach by showing',
    icon: '🪞',
    badge: '🪞 Teacher',
    scenes: [
      {
        art: 'leader-follower',
        caption: 'Now for the magic. Move the controller arm with your hand, and Pip copies you, like a mirror.',
      },
      {
        art: 'demos',
        caption: 'When you record yourself doing a task a few times, those recordings are practice examples for Pip’s brain.',
        deeper: 'Good examples are slow, smooth, and start from the same spot. Five good ones beat twenty messy ones.',
      },
    ],
    mission: {
      tab: 'teach',
      intro: 'On the Teach tab, press "Copy me", then record and save a demo.',
      steps: [
        { text: 'Start "Copy me"', check: 'copied' },
        { text: 'Record and save a demo', check: 'recorded' },
      ],
    },
  },
  {
    id: 'train',
    video: 'train',
    title: 'Train the robot brain',
    icon: '🧠',
    badge: '🧠 AI Trainer',
    scenes: [
      {
        art: 'brain',
        caption: 'Pip’s brain looks at your examples and practices guessing where to move next. Each round it makes fewer mistakes.',
        deeper: 'This is called imitation learning: the robot learns by copying examples, like you learning a dance.',
        engineer: 'The brain is a small neural network with about 5,000 numbers. Training nudges them to shrink the error.',
        ms: 11000,
      },
    ],
    mission: {
      tab: 'train',
      intro: 'On the Train tab, pick your task and press "Start learning". Watch the mistakes go down!',
      steps: [{ text: 'Train a robot brain', check: 'trained' }],
    },
  },
  {
    id: 'test',
    video: 'train',
    title: 'Test like a scientist',
    icon: '🔬',
    badge: '🔬 Scientist',
    scenes: [
      {
        art: 'trials',
        caption: 'Scientists test things many times. Run your brain ten times and count how often it works. That’s your success rate.',
        deeper: 'Then change one thing, like adding more demos, and test again. Did it get better?',
      },
      {
        art: 'graduation',
        caption: 'You did it! You coded, taught and trained a real robot. You are a GRIP Robot Trainer, and the future of robots needs you!',
      },
    ],
    mission: {
      tab: 'run',
      intro: 'On the Try it tab, let your robot brain drive and count how many tries work.',
      steps: [{ text: 'Let your robot brain run a skill', check: 'skillRun' }],
    },
  },
];
