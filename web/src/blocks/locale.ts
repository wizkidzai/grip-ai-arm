import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';

// Its own module so it runs before the keyboard-navigation plugin loads: the plugin reads
// message strings (shortcut section names) once, at import time.
Blockly.setLocale(En as unknown as Record<string, string>);
