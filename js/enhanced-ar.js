/** Experimental WebXR local-tracking path. Sensor AR remains the fallback. */
export async function detectEnhancedAR(navigatorObject=globalThis.navigator){
  if(!navigatorObject?.xr?.isSessionSupported)return false;
  try{return await navigatorObject.xr.isSessionSupported('immersive-ar')}catch(_){return false}
}

export function createEnhancedARState(){return{
  available:false,enabled:false,active:false,session:null,referenceSpace:null,
  viewerPose:null,initialPose:null,error:null,domOverlayActive:false,
  xrYaw:null,initialXRYaw:null,initialCompassHeading:null,xrHeading:null
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

/** requestSession is called before the first await to preserve user activation. */
export async function startEnhancedAR({state,navigatorObject=globalThis.navigator,root,
  getCompassHeading=()=>null,onHeading=()=>{},onFrame=()=>{},stopCamera=()=>{},restoreCamera=()=>{}}){
  let restored=false,ended=false,lastFrameTime=null,northCorrection=0;
  const restore=()=>{if(restored)return;restored=true;restoreCamera()};
  const deactivate=()=>{state.active=false;state.session=null;state.referenceSpace=null;state.viewerPose=null;restore()};
  state.initialPose=null;state.initialXRYaw=null;state.initialCompassHeading=null;
  state.xrYaw=null;state.xrHeading=null;state.domOverlayActive=false;
  stopCamera();
  try{
    const sessionPromise=navigatorObject.xr.requestSession('immersive-ar',{
      optionalFeatures:['dom-overlay','local-floor'],domOverlay:{root}
    });
    const session=await sessionPromise;
    state.session=session;
    session.addEventListener('end',()=>{ended=true;state.domOverlayActive=false;deactivate()},{once:true});
    if(!session.domOverlayState){state.error=new Error('DOM Overlay není dostupný');await session.end();throw state.error}
    state.domOverlayActive=true;
    state.referenceSpace=await session.requestReferenceSpace('local');
    state.active=true;state.error=null;
    const onXRFrame=(time,frame)=>{
      if(!state.active)return;
      session.requestAnimationFrame(onXRFrame);
      const pose=frame.getViewerPose(state.referenceSpace);
      if(!pose)return;
      state.viewerPose=pose;
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
    if(!ended&&state.session)try{await state.session.end()}catch(_){}
    deactivate();return false;
  }
}
