import { z } from 'zod';

export const echoInputSchema = z.object({
  message: z.string().describe('The message to echo back'),
});

export type EchoInput = z.infer<typeof echoInputSchema>;

export type EchoResult = {
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * Pure echo handler — separated from the server bootstrap so tests can
 * import and exercise it without spawning stdio transport.
 */
export function handleEcho(input: EchoInput): EchoResult {
  return {
    content: [{ type: 'text', text: input.message }],
  };
}
