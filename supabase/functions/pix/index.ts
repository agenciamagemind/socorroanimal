import {createHandler} from '../_shared/handler.ts';
Deno.serve(createHandler(Deno.env.toObject(),'production'));
