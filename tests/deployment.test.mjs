import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { prepareVercel, deploymentFiles } from '../scripts/prepare-vercel.mjs';

test('package allowlist excludes unrelated files, preserves project link and replaces stale output',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'iris-deploy-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(resolve(root,'vercel.json'),await readFile(new URL('../vercel.json',import.meta.url)));
  for(const file of deploymentFiles){const target=resolve(root,'dist',file);await mkdir(dirname(target),{recursive:true});await writeFile(target,`fixture: ${file}`);}
  await writeFile(resolve(root,'dist','.env'),'not for deployment');
  await mkdir(resolve(root,'.vercel/output/static'),{recursive:true});
  await writeFile(resolve(root,'.vercel/project.json'),'keep the project link');
  await writeFile(resolve(root,'.vercel/output/static','stale.js'),'old code');
  await prepareVercel(root);
  const files=await readdir(resolve(root,'.vercel/output/static'),{recursive:true});
  assert(!files.includes('.env'));assert(!files.includes('stale.js'));
  assert.equal(await readFile(resolve(root,'.vercel/project.json'),'utf8'),'keep the project link');
  const photo='Bajo la mirada cinemática.png';
  assert.deepEqual(await readFile(resolve(root,'.vercel/output/static',photo)),await readFile(resolve(root,'dist',photo)));
  const config=JSON.parse(await readFile(resolve(root,'.vercel/output/config.json'),'utf8'));
  assert.equal(config.version,3);assert.equal(config.routes[1].dest,'/index.html');
  await rm(resolve(root,'dist',photo));
  await assert.rejects(prepareVercel(root),/Falta un archivo de compilación válido/);
  assert.equal(await readFile(resolve(root,'.vercel/output/static',photo),'utf8'),`fixture: ${photo}`);
});
