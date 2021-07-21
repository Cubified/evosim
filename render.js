/*
 * render.js: evosim rendering with three.js
 *
 * Ugly and bad and mostly stolen
 */
var camera, controls, scene, renderer, composer;
var postScene, postCamera;
var AAScene;
var water, depthTarget, depthTarget2, maskTarget, mainTarget, AATarget;
var listener, audioLoader;
var billboard_canvas, billboard_ctx, plane_mat;

var mtlLoader = new THREE.MTLLoader();
var objLoader = new THREE.OBJLoader();

window.coconut = new THREE.Object3D();
window.person = new THREE.Object3D();
window.apple = new THREE.Object3D();

window.chompSound = null;
window.predSound = null;
window.popSound = document.getElementById('pop-sound');
window.popSound.volume = 0.4;

var models = [{
    'name': 'Tugboat',
    'pos': {
      x: -20,
      y: -2,
      z: 0
    }
  },
  {
    'name': 'Octopus',
    'pos': {
      x: -15,
      y: -5,
      z: -5
    },
    'scale': 0.2
  },
  {
    'name': 'Lighthouse',
    'pos': {
      x: 12,
      y: -5,
      z: 9
    },
    'scale': 0.6
  },
  {
    'name': 'island',
    'pos': {
      x: 0,
      y: -5,
      z: 0
    },
    'scale': 10
  },
  {
    name: 'coconut',
    pos: {x: 0, y: 0, z: 0},
    scale: 0.1,
    onCreate: (obj)=>{
      obj.children.forEach(child=>{
        child.material.side = THREE.DoubleSide;
      });
      scene.remove(obj);
      window.coconut = obj;
    }
  },
  {
    name: 'person',
    pos: {x: 0, y: 0, z: 0},
    scale: 0.15,
    onCreate: (obj)=>{
      scene.remove(obj);
      window.person = obj;
    }
  },
  {
    name: 'apple',
    pos: {x: 0, y: 0, z: 0},
    scale: 0.15,
    onCreate: (obj)=>{
      scene.remove(obj);
      window.apple = obj;
    }
  },
  {
    name: 'cloud1',
    pos: {x: -1, y: 7, z: 2},
    scale: 1,
    onCreate: (obj)=>{
      obj.userData.angle = 0;
      setInterval(()=>{
        obj.userData.angle += 0.002;
        obj.position.x = Math.sin(obj.userData.angle+(Math.PI/3))*2;
        obj.position.z = Math.cos(obj.userData.angle+(Math.PI/3))*2;
        obj.lookAt(0, 7, 0);
        obj.rotation.y += Math.PI/2;
      }, 10);
    }
  },
  {
    name: 'cloud2',
    pos: {x: 5, y: 7, z: -2},
    scale: 1,
    onCreate: (obj)=>{
      obj.userData.axis = new THREE.Vector3(0, 0, 0);
      obj.userData.angle = 0;
      setInterval(()=>{
        obj.userData.angle += 0.0005;
        obj.position.x = Math.sin(obj.userData.angle-(4*Math.PI/7))*4;
        obj.position.z = Math.cos(obj.userData.angle-(4*Math.PI/7))*4;
        obj.lookAt(0, 7, 0);
        obj.rotation.y += Math.PI/2;
      }, 10);
    }
  },
  {
    name: 'cloud3',
    pos: {x: -4, y: 7, z: 3},
    scale: 1,
    onCreate: (obj)=>{
      obj.userData.axis = new THREE.Vector3(0, 1, 0);
      obj.userData.angle = 0;
      setInterval(()=>{
        obj.userData.angle += 0.001;
        obj.position.x = Math.sin(obj.userData.angle)*7;
        obj.position.z = Math.cos(obj.userData.angle)*7;
        obj.lookAt(0, 7, 0);
        obj.rotation.y += Math.PI/2;
      }, 10);
    }
  },
];

var objects = {};

function LoadModels(models) {
  var model = models[0];
  var material_file = 'assets/materials/' + model.name + '.mtl';
  var object_file = 'assets/models/' + model.name + '.obj';

  mtlLoader.load(material_file, function(materials) {
    materials.preload();

    objLoader.setMaterials(materials);

    objLoader.load(object_file, function(object) {
      scene.add(object);

      object.material = materials.materials[model.name + "_mat"];

      if(object.material !== undefined){
        object.material.color.r = 1;
        object.material.color.g = 1;
        object.material.color.b = 1;
      }

      objects[model.name] = object;

      if (model.scale) {
        object.scale.set(model.scale, model.scale, model.scale);
      }

      object.position.set(model.pos.x, model.pos.y, model.pos.z);

      if(model.onCreate !== undefined) model.onCreate(object);

      var newModels = models.slice(1);
      if (newModels.length != 0) LoadModels(newModels);
    });
  });
}

function CreateWaterMesh() {
  var vertShader = `
	uniform float uTime;
	varying vec2 vUV;
	varying vec3 WorldPosition;
	void main() {
		vec3 pos = position;
		pos.z += cos(pos.x*5.0+uTime) * 0.1 * sin(pos.y * 5.0 + uTime);
		WorldPosition = pos;
		vUV = uv;
		//gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
	}`;
  var fragShader = `
	#include <packing>
	varying vec2 vUV;
	varying vec3 WorldPosition;
	uniform sampler2D uSurfaceTexture;
	uniform sampler2D uDepthMap;
	uniform sampler2D uDepthMap2;
	uniform float uTime;
	uniform float cameraNear;
	uniform float cameraFar;
	uniform vec4 uScreenSize;
	uniform bool isMask;
	float readDepth (sampler2D depthSampler, vec2 coord) {
		float fragCoordZ = texture2D(depthSampler, coord).x;
		float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
		return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
	}
	float getLinearDepth(vec3 pos) {
	    return -(viewMatrix * vec4(pos, 1.0)).z;
	}
	float getLinearScreenDepth(sampler2D map) {
	    vec2 uv = gl_FragCoord.xy * uScreenSize.zw;
	    return readDepth(map,uv);
	}
	void main(){
		vec4 color = vec4(0.0,0.7,1.0,0.5);
		vec2 pos = vUV * 2.0 * 10.0;
    	pos.y -= uTime * 0.002;
		vec4 WaterLines = texture2D(uSurfaceTexture, pos);
		color.rgba += WaterLines.r * 0.1;
		//float worldDepth = getLinearDepth(WorldPosition);
		float worldDepth = getLinearScreenDepth(uDepthMap2);
	    float screenDepth = getLinearScreenDepth(uDepthMap);
	    float foamLine = clamp((screenDepth - worldDepth),0.0,1.0) ;
	    if(foamLine < 0.001){
	        color.rgba += 0.2;
	    }
	    if(isMask){
	    	color = vec4(1.0);
	    }
		gl_FragColor = color;
	}`;

  var waterLinesTexture = THREE.ImageUtils.loadTexture('assets/textures/WaterTexture.png');
  waterLinesTexture.wrapS = THREE.RepeatWrapping;
  waterLinesTexture.wrapT = THREE.RepeatWrapping;

  var uniforms = {
    uTime: {
      value: 0.0
    },
    uSurfaceTexture: {
      type: "t",
      value: waterLinesTexture
    },
    cameraNear: {
      value: camera.near
    },
    cameraFar: {
      value: camera.far
    },
    uDepthMap: {
      value: depthTarget.depthTexture
    },
    uDepthMap2: {
      value: depthTarget2.depthTexture
    },
    isMask: {
      value: false
    },
    uScreenSize: {
      value: new THREE.Vector4(window.innerWidth, window.innerHeight, 1 / window.innerWidth, 1 / window.innerHeight)
    }
  };

  var water_geometry = new THREE.PlaneGeometry(500, 500, 50, 50);
  var water_material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertShader,
    fragmentShader: fragShader,
    transparent: true,
    depthWrite: false
  });
  var water = new THREE.Mesh(water_geometry, water_material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1;

  water.uniforms = uniforms;
  water.material = water_material;

  return water;
}

function render_init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6CC8FFFF);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = -10;
  camera.position.x = 15;
  camera.position.y = 5;

  listener = new THREE.AudioListener();
  camera.add(listener);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enableZoom = true;

  // Ground
  var ground_geometry = new THREE.PlaneGeometry(500, 500, 1);
  var ground_material = new THREE.MeshPhongMaterial({
    color: 0xFFA457,
    shininess: 0
  });
  var ground = new THREE.Mesh(ground_geometry, ground_material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -5;
  scene.add(ground);

  // lights
  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(1, 1, -1);
  light.intensity = 0.7;
  scene.add(light);

  var light2 = new THREE.AmbientLight(0xFFC480);
  scene.add(light2);

  window.addEventListener('resize', onWindowResize, false);

  // Set up depth buffer 
  depthTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  depthTarget.texture.format = THREE.RGBFormat;
  depthTarget.texture.generateMipmaps = false;
  depthTarget.stencilBuffer = false;
  depthTarget.depthBuffer = true;
  depthTarget.depthTexture = new THREE.DepthTexture();
  depthTarget.depthTexture.type = THREE.UnsignedShortType;

  // This is used as a hack to get the depth of the pixels at the water surface by redrawing the scene with the water in the depth buffer
  depthTarget2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  depthTarget2.texture.format = THREE.RGBFormat;
  depthTarget2.texture.generateMipmaps = false;
  depthTarget2.stencilBuffer = false;
  depthTarget2.depthBuffer = true;
  depthTarget2.depthTexture = new THREE.DepthTexture();
  depthTarget2.depthTexture.type = THREE.UnsignedShortType;

  // Used to know which areas of the screen are udnerwater
  maskTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  maskTarget.texture.format = THREE.RGBFormat;
  maskTarget.texture.generateMipmaps = false;
  maskTarget.stencilBuffer = false;

  // Used to apply the distortion effect
  mainTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  mainTarget.texture.format = THREE.RGBFormat;
  mainTarget.texture.generateMipmaps = false;
  mainTarget.stencilBuffer = false;

  // Used to apply antialiasing 
  AATarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  AATarget.texture.format = THREE.RGBFormat;
  AATarget.texture.generateMipmaps = false;
  AATarget.stencilBuffer = false;

  setupPost();
  setupAAEffect();

  // Water 
  water = CreateWaterMesh();
  scene.add(water);

  // Billboard
  /*
  let billboard_group = new THREE.Object3D();

  let billboard_box = new THREE.BoxGeometry(20, 5);
  let billboard_mat = new THREE.MeshPhongMaterial({color: 0xbbbbbb});
  let billboard_mesh = new THREE.Mesh(billboard_box, billboard_mat);
  billboard_group.add(billboard_mesh);

  billboard_canvas = document.createElement('canvas');
  billboard_canvas.width = 512;
  billboard_canvas.height = 128;
  billboard_ctx = billboard_canvas.getContext('2d');
  let plane_geom = new THREE.PlaneGeometry(18, 4, 1);
  plane_mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(billboard_canvas)
  });
  let plane_mesh = new THREE.Mesh(plane_geom, plane_mat);
  plane_mesh.rotation.y = Math.PI;
  plane_mesh.position.z = -0.6;
  billboard_group.add(plane_mesh);
  
  billboard_group.position.set(0, 1, 10);
  scene.add(billboard_group);*/

  // Effect Composer
  composer = new THREE.EffectComposer(renderer);

  let renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  /* TODO: More effects */

  // Models
  LoadModels(models);

  // Sounds
  audioLoader = new THREE.AudioLoader();
  audioLoader.load('assets/audio/tmp/villager3.mp3', (buffer)=>{
    window.chompSound = buffer;
  });
  audioLoader.load('assets/audio/tmp/chomp.mp3', (buffer)=>{
    window.predSound = buffer;
  });
}

function setupPost() {
  var fragShader = `
				varying vec2 vUv;
				uniform sampler2D uColorBuffer;
				uniform sampler2D uMaskBuffer;
				uniform float uTime;
				void main() {
					vec2 pos = vUv;
    
				    float X = pos.x*15.+uTime*0.5;
				    float Y = pos.y*15.+uTime*0.5;
				    pos.y += cos(X+Y)*0.01*cos(Y);
				    pos.x += sin(X-Y)*0.01*sin(Y);
				    
				    // Check original position as well as new distorted position
				    vec4 maskColor = texture2D(uMaskBuffer, pos);
				    vec4 maskColor2 = texture2D(uMaskBuffer, vUv);
				    if(maskColor != vec4(1.0) || maskColor2 != vec4(1.0)){
				        pos = vUv;
				    }
				    
				    vec4 color = texture2D(uColorBuffer, pos);    
				    gl_FragColor = color;
				}
				`;
  var vertexShader = `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
				`;

  // Setup post processing stage
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var postMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragShader,
    uniforms: {
      uColorBuffer: {
        value: mainTarget.texture
      },
      uMaskBuffer: {
        value: maskTarget.texture
      },
      uTime: {
        value: 0
      }
    }
  });
  var postPlane = new THREE.PlaneBufferGeometry(2, 2);
  var postQuad = new THREE.Mesh(postPlane, postMaterial);
  postScene = new THREE.Scene();
  postScene.add(postQuad);

  postScene.postMaterial = postMaterial;
}

function setupAAEffect() {
  var fragShader = `
				uniform vec2 resolution;
				uniform sampler2D dataTexture;
				varying vec2 vUv;
				void main() {
				    vec2 fragCoord = vUv * resolution;
                                    gl_FragColor = texture2D(dataTexture, vUv);
				}
				`;

  var vertexShader = `
				varying vec2 vUv;
				void main() {
				    vUv = uv;
				    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}
				`;

  var AAMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragShader,
    uniforms: {
      dataTexture: {
        value: AATarget.texture
      },
      resolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight)
      }
    }
  });
  var AAPlane = new THREE.PlaneBufferGeometry(2, 2);
  var AAQuad = new THREE.Mesh(AAPlane, AAMaterial);
  AAScene = new THREE.Scene();
  AAScene.add(AAQuad);

}

function UpdateWater() {
  water.uniforms.uTime.value += 0.1;
}

function BuoyancyUpdate() {
  var BuoyantObjects = [objects['Tugboat']];

  for (var i = 0; i < BuoyantObjects.length; i++) {
    var obj = BuoyantObjects[i];
    if (obj == undefined) continue;
    if (obj.time == undefined) {
      obj.time = Math.random() * Math.PI * 2;
      obj.initialPosition = obj.position.clone();
      obj.initialRotation = obj.rotation.clone();
    }

    obj.time += 0.05;
    // Move object up and down 
    obj.position.y = obj.initialPosition.y + Math.cos(obj.time) * 0.07;

    // Rotate object slightly 
    obj.rotation.x = obj.initialRotation.x + Math.cos(obj.time * 0.25) * 0.02;
    obj.rotation.z = obj.initialRotation.z + Math.sin(obj.time * 0.5) * 2 * 0.02;
  }
}

function render() {
  //renderer.render(scene, camera);
  
  // Render the original scene
  renderer.render(scene, camera, mainTarget);
 
  // Render the water mask 
  water.material.uniforms.isMask.value = true;
  renderer.render(scene, camera, maskTarget);
  water.material.uniforms.isMask.value = false;

  // Render onto depth buffer 
  water.material.depthWrite = false;
  renderer.render(scene, camera, depthTarget);
  water.material.depthWrite = true;
  renderer.render(scene, camera, depthTarget2);

  // Render post process FX 
  renderer.render(postScene, postCamera, AATarget);

  // Final Anti-alias effect 
  renderer.render(AAScene, postCamera);
}

function render_org_new(org, is_pred) {
  let out = new THREE.Group();

  let mesh = window.person.clone(true);
  out.add(mesh);

  let sight = new THREE.CircleGeometry(org.stats.sight, 16),
      mat2  = new THREE.MeshPhongMaterial({color: 0xf3f3f3, opacity: 0.2, transparent: true, flatShading: true}),
      mesh2 = new THREE.Mesh(sight, mat2);
  mesh2.rotation.x = -Math.PI / 2;
  //out.add(mesh2);

  if(is_pred) out.scale.setScalar(2);
  else out.scale.setScalar(Math.pow(2, org.stats.stamina)/Math.pow(2, 100));
  out.position.y = 1.5;

  out.userData.sound = new THREE.PositionalAudio(listener);
  out.userData.sound.setBuffer(is_pred ? window.predSound : window.chompSound);
  out.userData.sound.setRefDistance(1);
  out.add(out.userData.sound);

  scene.add(out);
  return out;
}

function render_org_del(org) {
  let int = setInterval(()=>{
    if(org.mesh.children[1].scale.x > 0){
      org.mesh.children[1].scale.subScalar(0.02);
    }

    if(org.mesh.rotation.x > -Math.PI/2){
      org.mesh.rotation.x -= 0.03;
    } else {
      org.mesh.scale.subScalar(0.02);

      if(org.mesh.scale.x <= 0){
        scene.remove(org.mesh);
        clearInterval(int);
      }
    }
  }, 10);
}

function render_food_new(food) {
  let mesh;
  if(Math.random() < 0.5) mesh = window.coconut.clone(true);
  else mesh = window.apple.clone(true);
  mesh.rotation.set(Math.random()-(Math.PI/4), Math.random()-(Math.PI/4), Math.random()-(Math.PI/4));
  mesh.position.y = 1.5;
  mesh.scale.set(0, 0, 0);
  scene.add(mesh);

  let int = setInterval(()=>{
    if(mesh.scale.x < 0.1){
      mesh.scale.addScalar(0.02);
    } else clearInterval(int);
  }, 10);

  return mesh;
}

function render_food_del(food){/*
  let int = setInterval(()=>{
    if(food.mesh.scale.x > 0){
      food.mesh.scale.subScalar(0.02);
    } else {
      scene.remove(food.mesh);
      clearInterval(int);
    }
  }, 10);*/
  scene.remove(food.mesh);
}

function render_draw(world) {
  let stat = {
    avg: {speed: 0, stamina: 0, sight: 0},
    max: {speed: 0, stamina: 0, sight: 0},
    min: {speed: Infinity, stamina: Infinity, sight: Infinity}
  };

  controls.update(); // required if controls.enableDamping = true, or if controls.autoRotate = true
  UpdateWater();
  BuoyancyUpdate();

  postScene.postMaterial.uniforms.uTime.value += 0.1;

  world.pop.forEach((org, ind)=>{
    if(world.is_new_generation){
      stat.avg.speed += org.stats.speed;
      stat.avg.stamina += org.stats.stamina;
      stat.avg.sight += org.stats.sight;

      if(org.stats.speed > stat.max.speed) stat.max.speed = org.stats.speed;
      if(org.stats.stamina > stat.max.stamina) stat.max.stamina = org.stats.stamina;
      if(org.stats.sight > stat.max.sight) stat.max.sight = org.stats.sight;

      if(org.stats.speed < stat.min.speed) stat.min.speed = org.stats.speed;
      if(org.stats.stamina < stat.min.stamina) stat.min.stamina = org.stats.stamina;
      if(org.stats.sight < stat.min.sight) stat.min.sight = org.stats.sight;
    }

    org.mesh.position.x = (org.pos.x - (world.config.world.w/2));
    org.mesh.position.z = (org.pos.y - (world.config.world.h/2));

    if(org.timeout === 0){
      org.mesh.lookAt((org.goal.x - (world.config.world.w/2)), org.mesh.position.y, (org.goal.y - (world.config.world.h/2)));
      org.mesh.rotation.x = 0;
      org.mesh.rotation.z = 0;
      org.mesh.rotation.y -= Math.PI / 2;
    }

    if(!org.dead && e.time < org.stats.stamina){
      if(org.timeout === 0) org.mesh.children[0].rotation.x = (Math.sin((e.time * org.stats.speed * 10) / 2) / 4) + 1.5 - (Math.PI / 2);
      else {
        org.mesh.children[0].rotation.x = 0;
        org.mesh.position.y = (Math.sin((e.time * org.stats.speed * 8)) / 25) + 1.5;
      }
    }
  });

  world.food.forEach((food)=>{
    if(food.eaten && food.mesh.scale.x > 0) food.mesh.scale.subScalar(0.02);
    food.mesh.position.x = (food.pos.x - (world.config.world.w/2));
    food.mesh.position.z = (food.pos.y - (world.config.world.h/2));
  });

  world.pred.forEach((org)=>{
    org.mesh.position.x = (org.pos.x - (world.config.world.w/2));
    org.mesh.position.z = (org.pos.y - (world.config.world.h/2));

    if(org.timeout === 0){
      org.mesh.lookAt((org.goal.x - (world.config.world.w/2)), org.mesh.position.y, (org.goal.y - (world.config.world.h/2)));
      org.mesh.rotation.x = 0;
      org.mesh.rotation.z = 0;
      org.mesh.rotation.y -= Math.PI / 2;
    }

    if(!org.dead && e.time < org.stats.stamina){
      if(org.timeout === 0) org.mesh.children[0].rotation.x = (Math.sin((e.time * org.stats.speed * 10) / 2) / 4) + 1.5 - (Math.PI / 2);
      else {
        org.mesh.children[0].rotation.x = 0;
        org.mesh.position.y = (Math.sin((e.time * org.stats.speed * 8)) / 25) + 1.5;
      }
    }
  });

  if(world.is_new_generation){
    /*billboard_ctx.fillStyle = 'white';
    billboard_ctx.fillRect(0, 0, billboard_canvas.width, billboard_canvas.height);

    billboard_ctx.fillStyle = 'black';
    billboard_ctx.font = '20pt sans-serif';
    billboard_ctx.fillText(`Generation ${world.generation}:  ${world.pop.length} organisms`, 10, 25);

    billboard_ctx.font = '16pt sans-serif';
    billboard_ctx.fillText(`Speed:`, 20, 50);
    billboard_ctx.fillText(`Stamina:`, 180, 50);
    billboard_ctx.fillText(`Sight:`, 360, 50);

    billboard_ctx.font = '14pt sans-serif';
    billboard_ctx.fillText(`Average = ${(stat.avg.speed/world.pop.length).toFixed(2)}`, 30, 70);
    billboard_ctx.fillText(`Maximum = ${(stat.max.speed).toFixed(2)}`, 30, 90);
    billboard_ctx.fillText(`Minimum = ${(stat.min.speed).toFixed(2)}`, 30, 110);

    billboard_ctx.fillText(`Average = ${(stat.avg.stamina/world.pop.length).toFixed(2)}`, 190, 70);
    billboard_ctx.fillText(`Maximum = ${(stat.max.stamina).toFixed(2)}`, 190, 90);
    billboard_ctx.fillText(`Minimum = ${(stat.min.stamina).toFixed(2)}`, 190, 110);

    billboard_ctx.fillText(`Average = ${(stat.avg.sight/world.pop.length).toFixed(2)}`, 370, 70);
    billboard_ctx.fillText(`Maximum = ${(stat.max.sight).toFixed(2)}`, 370, 90);
    billboard_ctx.fillText(`Minimum = ${(stat.min.sight).toFixed(2)}`, 370, 110);

    plane_mat.map.needsUpdate = true;*/

    window.popSound.play();
    world.is_new_generation = false;
  }

  //render();
  //renderer.render(scene, camera);
  composer.render();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  depthTarget.setSize(window.innerWidth, window.innerHeight);
  depthTarget2.setSize(window.innerWidth, window.innerHeight);
  mainTarget.setSize(window.innerWidth, window.innerHeight);
  maskTarget.setSize(window.innerWidth, window.innerHeight);
  AATarget.setSize(window.innerWidth, window.innerHeight);

  //water.uniforms.uScreenSize = new THREE.Vector4(window.innerWidth, window.innerHeight, 1 / window.innerWidth, 1 / window.innerHeight);
}
