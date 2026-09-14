/** Experimental WebXR local-tracking path. Sensor AR remains the fallback. */
export async function detectEnhancedAR(navigatorObject=globalThis.navigator){
  if(!navigatorObject?.xr?.isSessionSupported)return false;
  try{return await navigatorObject.xr.isSessionSupported('immersive-ar')}catch(_){return false}
}

export function createEnhancedARState(){return{
  available:false,enabled:false,active:false,session:null,referenceSpace:null,
  viewerPose:null,initialPose:null,error:null,domOverlayActive:false,
  sessionCreated:false,layerCreated:false,poseAvailable:false,
  xrYaw:null,initialXRYaw:null,initialCompassHeading:null,xrHeading:null,
  visibilityState:null,interrupted:false,ending:false,lastXRFrameAt:null,
  interrupt:null
}}

export const normalizeDegrees=value=>(value%360+360)%360;
export const signedAngleDelta=(value,origin)=>((value-origin+540)%360)-180;

/** Camera heading around WebXR's up axis. Negating mathematical Y rotation makes
 * clockwise phone turns increase heading, matching compass bearings. */
export function quaternionToYaw({x=0,y=0,z=0,w=1}={}){
  const mathematicalYaw=Math.atan2(2*(w*y+x*z),1-2*(y*y+z*z))*180/Math.PI;
  return normalizeDegrees(-mathematicalYaw);
}

export function alignYawToNorth(initialCompassHeading,currentXRYaw,initialXRYaw){
  return normalizeDegrees(initialCompassHeading+signedAngleDelta(currentXRYaw,initialXRYaw));
}

/** Keeps requestSession in the recovery button's user-activation handler. */
export function setupEnhancedARRecovery({state,panel,button,beginEnhancedAR,documentObject=globalThis.document}){
  const update=()=>panel.classList.toggle('hidden',documentObject.hidden||!state.interrupted||!state.enabled);
  button.onclick=()=>beginEnhancedAR().then(active=>{if(active)panel.classList.add('hidden');return active});
  update();return update;
}

/** requestSession is called before the first await to preserve user activation. */
export async function startEnhancedAR({state,navigatorObject=globalThis.navigator,root,
  documentObject=globalThis.document,XRWebGLLayerClass=globalThis.XRWebGLLayer,
  getCompassHeading=()=>null,onHeading=()=>{},onFrame=()=>{},onDeactivate=()=>{},stopCamera=()=>{},restoreCamera=()=>{}}){
  let restored=false,ended=false,endRequested=false,cameraStopped=false,lastFrameTime=null,northCorrection=0;
  const restore=()=>{if(restored||!cameraStopped)return;restored=true;restoreCamera()};
  let session;
  const deactivate=()=>{
    if(state.session!==session)return;
    state.active=false;state.session=null;state.referenceSpace=null;state.viewerPose=null;
    state.domOverlayActive=false;state.ending=false;state.interrupt=null;restore();onDeactivate();
  };
  const endSession=async(interrupted=false)=>{
    if(interrupted)state.interrupted=true;
    if(endRequested||ended||state.session!==session)return;
    endRequested=true;state.ending=true;
    try{await session.end()}catch(_){/* The end event is not guaranteed after an error. */}
    finally{deactivate()}
  };
  state.initialPose=null;state.initialXRYaw=null;state.initialCompassHeading=null;
  state.xrYaw=null;state.xrHeading=null;state.domOverlayActive=false;state.sessionCreated=false;
  state.layerCreated=false;state.poseAvailable=false;state.visibilityState=null;
  state.interrupted=false;state.ending=false;state.lastXRFrameAt=null;state.interrupt=null;
  try{
    const sessionPromise=navigatorObject.xr.requestSession('immersive-ar',{
      optionalFeatures:['dom-overlay','local-floor'],domOverlay:{root}
    });
    session=await sessionPromise;
    state.session=session;state.sessionCreated=true;
    state.visibilityState=session.visibilityState??null;
    state.interrupt=()=>endSession(true);
    session.addEventListener('end',()=>{ended=true;deactivate()},{once:true});
    session.addEventListener('visibilitychange',()=>{
      if(state.session!==session)return;
      state.visibilityState=session.visibilityState;
      if(session.visibilityState==='hidden')void endSession(true);
    });
    if(!session.domOverlayState){state.error=new Error('DOM Overlay není dostupný');await endSession();throw state.error}
    state.domOverlayActive=true;
    const canvas=documentObject.createElement('canvas');
    const gl=canvas.getContext('webgl',{xrCompatible:true,alpha:true,antialias:false});
    if(!gl)throw new Error('WebGL context pro WebXR není dostupný');
    if(typeof gl.makeXRCompatible==='function')await gl.makeXRCompatible();
    if(typeof XRWebGLLayerClass!=='function')throw new Error('XRWebGLLayer není dostupný');
    const layer=new XRWebGLLayerClass(session,gl,{alpha:true,depth:false,stencil:false,antialias:false});
    session.updateRenderState({baseLayer:layer});state.layerCreated=true;
    state.referenceSpace=await session.requestReferenceSpace('local');
    stopCamera();cameraStopped=true;
    state.active=true;state.error=null;
    const onXRFrame=(time,frame)=>{
      if(!state.active||state.session!==session||state.ending)return;
      session.requestAnimationFrame(onXRFrame);
      gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      const pose=frame.getViewerPose(state.referenceSpace);
      if(!pose)return;
      state.viewerPose=pose;state.poseAvailable=true;state.lastXRFrameAt=Date.now();
      const transform=pose.transform??pose.views?.[0]?.transform;
      if(!transform?.orientation)return;
      const yaw=quaternionToYaw(transform.orientation);state.xrYaw=yaw;
      const compass=getCompassHeading();
      if(state.initialXRYaw===null&&Number.isFinite(compass)){
        state.initialXRYaw=yaw;state.initialCompassHeading=compass;state.initialPose=pose;
      }
      if(state.initialXRYaw!==null){
        const heading=alignYawToNorth(state.initialCompassHeading,yaw,state.initialXRYaw);
        if(Number.isFinite(compass)&&lastFrameTime!==null){
          const maxCorrection=.05*Math.max(0,time-lastFrameTime)/1000;
          const error=signedAngleDelta(compass,normalizeDegrees(heading+northCorrection));
          northCorrection+=Math.sign(error)*Math.min(Math.abs(error)*.002,maxCorrection);
        }
        state.xrHeading=normalizeDegrees(heading+northCorrection);onHeading(state.xrHeading);
      }
      lastFrameTime=time;onFrame(pose);
    };
    session.requestAnimationFrame(onXRFrame);
    return true;
  }catch(error){
    state.error=error;state.domOverlayActive=false;
    if(!ended&&state.session===session)await endSession();
    deactivate();return false;
  }
}
