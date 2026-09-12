export const UNKNOWN_PERMISSIONS=Object.freeze({camera:'unknown',location:'unknown',orientation:'unknown'});

const deniedError=error=>error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError'||error?.code===1;

export function platformKind(nav=globalThis.navigator,win=globalThis.window){
 const ua=nav?.userAgent||'';
 if(/iPad|iPhone|iPod/.test(ua)||(nav?.platform==='MacIntel'&&nav?.maxTouchPoints>1))return 'ios';
 if(/Android/i.test(ua))return 'android';
 return 'other';
}

export class PermissionPanelView{
 constructor({panel,summary,list,button,help,helpText,helpClose}){this.panel=panel;this.summary=summary;this.list=list;this.button=button;this.help=help;this.helpText=helpText;this.helpClose=helpClose;}
 bind(recover){this.button.addEventListener('click',recover);this.helpClose.addEventListener('click',()=>this.help.close());}
 render(states){
  const missing=Object.entries(states).filter(([,value])=>value!=='granted');
  this.panel.classList.toggle('hidden',missing.length===0);
  this.summary.textContent=states.camera!=='granted'?'Nemohu spustit kameru.\nKlepněte pro povolení přístupu.':states.orientation!=='granted'?'Nemohu určit směr telefonu.\nKlepněte pro povolení pohybových senzorů.':'Potřebuji ještě jedno oprávnění';
  const labels={camera:'Kamera',location:'Poloha',orientation:'Pohybové senzory'};
  this.list.replaceChildren(...Object.entries(states).map(([name,value])=>{const li=document.createElement('li');li.className=`permission-${value}`;li.textContent=`${value==='granted'?'✓':'✕'} ${labels[name]}`;return li;}));
 }
 showHelp(platform,standalone){
  let text='Přístup je v prohlížeči zablokovaný. Otevřete nastavení tohoto webu a povolte Kameru, Polohu a pohybové senzory.';
  if(platform==='ios')text='Přístup je v telefonu zablokovaný.\n\nV Safari otevřete nastavení tohoto webu a povolte Kameru a Polohu.\n\nU pohybových senzorů zkuste znovu otevřít aplikaci a klepnout na „Povolit senzory“.'+(standalone?'\n\nPokud se dialog neobjeví, otevřete PID AR jednou v Safari a oprávnění nastavte tam.':'');
  if(platform==='android')text='Otevřete informace o webu vedle adresy → Oprávnění a povolte Polohu, Kameru a Senzory pohybu.\n\nResetovat oprávnění webu můžete ve stejné nabídce a potom požádat znovu.';
  this.helpText.textContent=text;this.help.showModal();
 }
}

/** Coordinates permission requests. recover() deliberately isn't async: every
 * protected API is invoked in the original click stack before any await. */
export class PermissionController{
 constructor({view,navigator:nav=globalThis.navigator,window:win=globalThis.window,orientationEvent=globalThis.DeviceOrientationEvent,motionEvent=globalThis.DeviceMotionEvent,startCamera,startLocation,startOrientation,onChange=()=>{}}){
  this.view=view;this.nav=nav;this.win=win;this.orientationEvent=orientationEvent;this.motionEvent=motionEvent;this.startCamera=startCamera;this.startLocation=startLocation;this.startOrientation=startOrientation;this.onChange=onChange;this.platform=platformKind(nav,win);this.states={...UNKNOWN_PERMISSIONS};this.orientationController=null;this.view.bind(()=>this.recover());this.render();
 }
 set(name,value){if(this.states[name]===value)return;this.states={...this.states,[name]:value};this.render();}
 render(){this.view.render(this.states);this.onChange(this.states);}
 recover(){
  // Do not move these calls behind an await: WebKit checks transient activation here.
  const orientationRequest=this.requestOrientationPermission();
  const cameraRequest=this.states.camera==='granted'?null:this.call(this.startCamera);
  const locationRequest=this.states.location==='granted'?null:this.call(this.startLocation);
  return Promise.all([this.finishOrientation(orientationRequest),this.finish('camera',cameraRequest),this.finish('location',locationRequest)]).then(()=>{
   if(Object.values(this.states).some(value=>value==='denied'))this.view.showHelp(this.platform,this.isStandalone());
   return this.states;
  });
 }
 call(fn){try{return Promise.resolve(fn())}catch(error){return Promise.reject(error)}}
 requestOrientationPermission(){
  if(this.states.orientation==='granted'||(this.states.orientation==='denied'&&this.platform==='ios'))return {skip:true};
  if(!this.orientationEvent)return {unsupported:true};
  try{
   const orientation=typeof this.orientationEvent.requestPermission==='function'?this.orientationEvent.requestPermission():Promise.resolve('granted');
   const motion=typeof this.motionEvent?.requestPermission==='function'?this.motionEvent.requestPermission():Promise.resolve('granted');
   return {promise:Promise.all([orientation,motion])};
  }catch(error){return {promise:Promise.reject(error)}}
 }
 async finishOrientation(request){
  if(request.skip)return;
  if(request.unsupported){this.set('orientation','unsupported');return}
  try{const results=await request.promise;if(results.every(value=>value==='granted')){this.set('orientation','granted');this.orientationController?.stop?.();this.orientationController=await this.startOrientation();}else this.set('orientation','denied');}catch(error){this.set('orientation',deniedError(error)?'denied':'unsupported')}
 }
 async finish(name,promise){if(!promise)return;try{await promise;this.set(name,'granted')}catch(error){this.set(name,deniedError(error)?'denied':'denied')}}
 isStandalone(){return this.win?.matchMedia?.('(display-mode: standalone)').matches===true||this.nav?.standalone===true}
 async check(){
  const permissions=this.nav?.permissions;if(!permissions?.query)return this.states;
  await Promise.all([['camera','camera'],['location','geolocation']].map(async([key,name])=>{try{const result=await permissions.query({name});if(result.state==='granted')this.set(key,'granted');else if(result.state==='denied')this.set(key,'denied')}catch(_){/* unsupported permission name */}}));
  return this.states;
 }
 async handleVisibility(){
  if(this.win.document.hidden)return this.states;
  await this.check();
  // Permissions API coverage differs by browser, so verify camera/location with
  // their real APIs as well. A successful return from settings recovers in place.
  await Promise.all([this.finish('camera',this.call(this.startCamera)),this.finish('location',this.call(this.startLocation))]);
  if(this.states.orientation==='granted'&&!this.orientationController)this.orientationController=await this.startOrientation();
  return this.states;
 }
}
