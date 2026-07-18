import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthState } from '../src/auth-state.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred(){ let resolve, reject; const promise=new Promise((res,rej)=>{resolve=res; reject=rej;}); return {promise, resolve, reject}; }
function mockClient(initial){
  let cb; let getCalls=0, subCalls=0;
  return {
    auth:{
      getSession(){ getCalls++; return initial.promise; },
      onAuthStateChange(fn){ subCalls++; cb=fn; return { data:{ subscription:{ unsubscribe(){} } } }; }
    },
    emit(event, session){ cb?.(event, session); },
    counts(){ return { getCalls, subCalls }; }
  };
}
const session = id => ({ user:{ id, is_anonymous:false } });

test('AuthState shares delayed initialization and never publishes ready signed-out before restoration', async()=>{
  const d=deferred(); const client=mockClient(d); const seen=[];
  const auth=createAuthState({ getClient: async()=>client, clearPreferences(){} });
  auth.subscribe(s=>seen.push(s));
  const a=auth.start(); const b=auth.start();
  await tick();
  assert.equal(client.counts().subCalls,1);
  assert.equal(seen.at(-1).ready,false);
  d.resolve({ data:{ session: session('u1') } });
  const [sa,sb]=await Promise.all([a,b]);
  assert.equal(sa.userId,'u1'); assert.equal(sb.userId,'u1');
  assert.equal(client.counts().getCalls,1);
});

test('AuthState handles sign-in refresh update sign-out user switch and suppresses duplicate material state', async()=>{
  const d=deferred(); const client=mockClient(d); let clears=0; const seen=[];
  const auth=createAuthState({ getClient: async()=>client, clearPreferences(){clears++;} });
  auth.subscribe(s=>seen.push(s.userId));
  d.resolve({ data:{ session:null } }); await auth.start();
  client.emit('SIGNED_IN', session('u1'));
  client.emit('TOKEN_REFRESHED', session('u1'));
  client.emit('USER_UPDATED', session('u1'));
  client.emit('SIGNED_IN', session('u2'));
  client.emit('SIGNED_OUT', null);
  await tick();
  assert.deepEqual(seen.filter(Boolean), ['u1','u2']);
  assert.equal(auth.snapshot().session, null);
  assert.equal(clears, 1);
});

test('AuthState initialization failure is recoverable with retry and one subscription', async()=>{
  let attempt=0; const good=deferred(); const client=mockClient(good);
  const auth=createAuthState({ getClient: async()=>{ attempt++; if(attempt===1) throw new Error('offline'); return client; }, clearPreferences(){} });
  const failed=await auth.start();
  assert.equal(failed.failed,true);
  good.resolve({ data:{ session: session('u3') } });
  const restored=await auth.retry();
  assert.equal(restored.userId,'u3');
  assert.equal(client.counts().subCalls,1);
});
