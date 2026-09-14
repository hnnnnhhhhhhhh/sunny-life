import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {HalfFloatType,WebGLRenderTarget} from 'three';

export function createInteriorRenderer(renderer,scene,camera){
  const target=new WebGLRenderTarget(512,512,{type:HalfFloatType,samples:4});
  const composer=new EffectComposer(renderer,target),beauty=new RenderPass(scene,camera);
  const ao=new SSAOPass(scene,camera,512,512,12),output=new OutputPass();
  ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA=0;
  ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA=0;
  ao.kernelRadius=.5;
  ao.minDistance=.00006;
  ao.maxDistance=.0014;
  ao.ssaoMaterial.fragmentShader=ao.ssaoMaterial.fragmentShader.replace('1.0 - occlusion','1.0 - occlusion * 0.65');
  composer.addPass(beauty);composer.addPass(ao);composer.addPass(output);
  return {
    resize(width,height){
      composer.setPixelRatio(Math.min(renderer.getPixelRatio(),1));
      composer.setSize(width,height);
    },
    render(activeCamera){
      beauty.camera=activeCamera;ao.camera=activeCamera;
      const perspective=activeCamera.isPerspectiveCamera?1:0;
      if(ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA!==perspective){
        ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA=perspective;
        ao.ssaoMaterial.needsUpdate=true;
      }
      ao.ssaoMaterial.uniforms.cameraNear.value=activeCamera.near;
      ao.ssaoMaterial.uniforms.cameraFar.value=activeCamera.far;
      ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(activeCamera.projectionMatrix);
      ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(activeCamera.projectionMatrixInverse);
      composer.render();
    },
    dispose(){ao.dispose();beauty.dispose();output.dispose();composer.dispose();},
  };
}
