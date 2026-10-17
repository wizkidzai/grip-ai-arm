---
name: blockly-robot-blocks
description: "Use when designing or implementing Scratch-like drag-and-drop block coding for the robot arm: Blockly blocks, toolbox categories, block-to-command compiler, program runner, loops, conditions, variables, block UX for kids aged 8-17."
---

# Block Coding for the Robot Arm

## Approach
- Use **Blockly** (or a compatible library) for the editor. Customize colors, shapes, and size to feel playful, like Scratch.
- Pipeline: `workspace -> validated JSON program (AST) -> command list -> driver`. Do not execute generated JavaScript from blocks with `eval`; interpret a safe, limited program format.
- Save projects as JSON with a version number so old projects can be migrated.

## Suggested toolbox (kid-friendly names)
| Category | Blocks |
|---|---|
| Move | move [joint] to [angle]; turn [joint] by [degrees]; go home |
| Hand | open hand; close hand; set grip [0-100]% |
| Speed | set speed [slow / medium / fast] |
| Control | wait [seconds]; repeat [n]; repeat until; if / else; forever (stoppable) |
| Sensing | camera sees [color/object]; arm is at [pose] (add later) |
| Poses | save pose [name]; go to pose [name] |
| AI | run my trained skill [name]; record a new skill |
| Variables | set, change, and use variables |

## UX rules
- Joint names are friendly ("Base spin", "Shoulder", "Elbow", "Wrist tilt", "Wrist spin", "Hand") with icons; show real names in a tooltip for older users.
- Sliders and dials for angles, capped to safe limits; show the preview arm update live.
- Run in the simulator first; highlight the currently running block.
- A big Stop button, plus stop when the tab loses focus or the connection drops.
- Cap loop counts and total run time; "forever" loops must be stoppable.
- Optional "show me the code" view (Python/JS) for older learners.
- Starter challenges and templates (wave hello, pick up a cube, draw a shape) with hints rather than blank canvas.

## Compiler checklist
1. Validate block types, argument ranges, and nesting depth.
2. Expand loops with a step limit so a program cannot run forever without a stop.
3. Emit commands in units of degrees and percent; the command layer clamps again.
4. Return kid-friendly errors attached to the offending block ("This arm can't bend that far yet").

## Accessibility
- Keyboard navigation and screen reader labels for blocks (Blockly keyboard navigation plugin).
- High-contrast theme, adjustable block size, no color-only meaning.

## Testing
- Snapshot tests: workspace JSON -> command list.
- Property tests: any program output stays within limits.
