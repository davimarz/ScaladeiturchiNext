import test from 'node:test';
import assert from 'node:assert/strict';
import { readServiceJson } from '../src/lib/service-json.ts';
test('handles HTML and malformed service errors without exposing JSON parser failures', async () => {
 for(const response of [new Response('An error occurred',{status:504}),new Response('{invalid',{headers:{'content-type':'application/json'},status:502})]) await assert.rejects(readServiceJson(response,'Riprova la verifica.'),{message:'Riprova la verifica.'});
 const value=await readServiceJson(new Response('{"remaining":12}',{headers:{'content-type':'application/json'}}),'Unavailable');assert.equal(value.remaining,12);
});
