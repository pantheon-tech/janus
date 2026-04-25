import { assertType, expectTypeOf, test } from 'vitest';

import type { Greetable, Hello } from '../src/index.js';

test('Hello is a template literal type', () => {
  const greeting = 'Hello, World!' as Hello;
  assertType<Hello>(greeting);

  // A non-matching literal must not be assignable.
  // @ts-expect-error — "Goodbye, World!" does not match `Hello, ${string}!`
  assertType<Hello>('Goodbye, World!');
});

test('Greetable has a string name property', () => {
  expectTypeOf<Greetable>().toHaveProperty('name').toBeString();
});

test('Greetable accepts a conforming object', () => {
  const greeter: Greetable = { name: 'Janus' };
  assertType<Greetable>(greeter);
});
