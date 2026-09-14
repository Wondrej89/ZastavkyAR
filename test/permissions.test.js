import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionController,PermissionPanelView} from '../js/permissions.js';

class FakeView{
 constructor(){this.renders=[];this.help=[]}
 bind(handler){this.click=handler}
 render(states){this.renders.push({...states})}
 showHelp(...args){this.help.push(args)}
}
const nav=(ua='iPhone')=>({userAgent:ua});
const make=(overrides={})=>{const view=new FakeView();const values={view,navigator:nav(),window:{document:{hidden:false},matchMedia:()=>({matches:false})},orientationEvent:{requestPermission:()=>Promise.resolve('granted')},motionEvent:undefined,startCamera:()=>Promise.resolve(),startLocation:()=>Promise.resolve(),startOrientation:()=>Promise.resolve({stop(){}}),...overrides};return {view,controller:new PermissionController(values)}};

test('iOS orientation permission is invoked synchronously by the click flow',async()=>{
 let active=false,calledDuringClick=false;const {view}=make({orientationEvent:{requestPermission(){calledDuringClick=active;return Promise.resolve('granted')}}});
 active=true;const result=view.click();active=false;await result;
 assert.equal(calledDuringClick,true);
});

test('granted permission restarts orientation controller without reload',async()=>{
 let starts=0;const {view,controller}=make({startOrientation:()=>{starts++;return Promise.resolve({stop(){}})}});
 await view.click();assert.equal(controller.states.orientation,'granted');assert.equal(starts,1);
});

test('denied iOS sensor request shows help and is not requested forever',async()=>{
 let requests=0;const {view}=make({orientationEvent:{requestPermission(){requests++;return Promise.resolve('denied')}}});
 await view.click();await view.click();assert.equal(requests,1);assert.equal(view.help.length,2);assert.equal(view.help[0][0],'ios');
});

test('Android denial selects platform-specific instructions',async()=>{
 const denied=()=>Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));const {view}=make({navigator:nav('Android Chrome'),orientationEvent:{},startCamera:denied});
 await view.click();assert.equal(view.help[0][0],'android');
});

test('visibility check re-queries permissions and restarts newly granted API',async()=>{
 let starts=0,queries=0;const fakeNavigator={userAgent:'Android',permissions:{query:async({name})=>{queries++;return {state:name==='camera'?'granted':'prompt'}}}};const {controller}=make({navigator:fakeNavigator,startCamera:()=>{starts++;return Promise.resolve()}});controller.states.camera='denied';controller.states.orientation='unknown';
 await controller.handleVisibility();assert.equal(queries,2);assert.equal(controller.states.camera,'granted');assert.equal(starts,1);
});

test('permission panel lists the state of every individual permission',()=>{
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>({className:'',textContent:''})};
 const children=[],panel={classList:{toggle(_name,hidden){panel.hidden=hidden}}},summary={},list={replaceChildren(...items){children.push(...items)}},button={addEventListener(){}},helpClose={addEventListener(){}},view=new PermissionPanelView({panel,summary,list,button,help:{},helpText:{},helpClose});
 view.render({camera:'granted',location:'denied',orientation:'unsupported'});
 assert.deepEqual(children.map(item=>item.textContent),['✓ Kamera','✕ Poloha','✕ Pohybové senzory']);assert.equal(panel.hidden,false);assert.match(summary.textContent,/směr telefonu/);
 globalThis.document=oldDocument;
});

test('camera runtime failure is error rather than denied',async()=>{
 const failure=Object.assign(new Error('camera busy'),{name:'NotReadableError'});const {controller}=make({startCamera:()=>Promise.reject(failure)});
 await controller.recover();assert.equal(controller.states.camera,'error');assert.equal(controller.cameraDiagnostics.errorName,'NotReadableError');assert.equal(controller.cameraDiagnostics.getUserMediaAttempted,true);
});
