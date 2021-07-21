/*
 * evosim.js: an evolution simulator
 */

function d(id){return document.getElementById(id);}

/*
 * GLOBALS
 */
const e = {
  pop: [],
  food: [],
  pred: [],
  time: 0,
  generation: 0,
  mutations: 0,
  is_new_generation: true,

  config: {
    popsize: 20,
    foodsize: 8,
    predsize: 3,
    world: {
      w: 8,
      h: 8
    },
    duration: 150,
    mutation: {
      chance: 50,
      negative: false,
      max: 5
    }
  }
};

const wander = 0,
      straight = 1;

/*
 * HELPER FUNCTIONS
 */
function rand(min, max){
  /*min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;*/
  return (Math.random()*(max-min))+min;
}

function randxy(){
  return point(rand(0, e.config.world.w), rand(0, e.config.world.h));
}

function dist(a, b){
  return Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2));
}

function interp(a, b, mu){
  let mu2 = (1-Math.cos(mu*Math.PI))/2;

  return point(a.x*(1-mu2)+b.x*mu2, a.y*(1-mu2)+b.y*mu2);
}

/*
 * PSEUDO-CLASSES
 */
function point(x, y){
  return {x, y};
}
function point_copy(pt){
  return point(pt.x, pt.y);
}

function org_new(is_pred){
  let out = {
    pos: randxy(),
    goal: randxy(),
    state: wander,
    dead: false,
    survive: false,
    mate: 0,
    timeout: 0,
    stats: {
      speed: (is_pred ? 0.04 : 0.05),
      stamina: 100,
      sight: 1
    },

    goalref: undefined
  };
  out.orig = out.pos;
  out.mesh = render_org_new(out, is_pred);
  return out;
}
function org_sim(org, is_pred){
  if(e.time > org.stats.stamina){
    if(!org.survive) org.dead = true;
    return;
  }

  if(org.state === wander){
    (is_pred ? e.pop : e.food).forEach((food)=>{
      if(dist(org.pos, food.pos) <= org.stats.sight){
        org.orig = org.pos;
        org.goal = food.pos;
        org.state = straight;
        org.goalref = food;
      }
    });
  }

  //org.pos = interp(org.pos, org.goal, dist(org.orig, org.goal)-dist(org.pos, org.goal));
 
  if(org.timeout > 0){
    org.timeout--;
    return;
  }

  if(org.pos.x > org.goal.x) org.pos.x -= org.stats.speed;
  if(org.pos.x < org.goal.x) org.pos.x += org.stats.speed;
  if(Math.abs(org.pos.x-org.goal.x) < org.stats.speed) org.pos.x = org.goal.x;

  if(org.pos.y > org.goal.y) org.pos.y -= org.stats.speed;
  if(org.pos.y < org.goal.y) org.pos.y += org.stats.speed;
  if(Math.abs(org.pos.y-org.goal.y) < org.stats.speed) org.pos.y = org.goal.y;

  if(org.pos.x === org.goal.x &&
     org.pos.y === org.goal.y){
    if(org.state === straight){
      if(is_pred ? true : !org.goalref.eaten){
        if(org.survive) org.mate++;
        if(is_pred){
          org_del(org.goalref, false);
        } else {
          food_del(org.goalref);
          org.goalref.eaten = true;
        }
        org.survive = true;
        org.timeout = 50;
        org.mesh.userData.sound.play(); // TODO: Lazy!
      }
    }

    org.orig = org.pos;
    org.goal = randxy();
    org.state = wander;
  }
}
function org_del(org, is_pred){
  render_org_del(org, is_pred);
  if(is_pred) e.pred.splice(e.pred.indexOf(org), 1);
  else e.pop.splice(e.pop.indexOf(org), 1);
}
function org_reset(org, is_pred){
  for(let i=0;i<org.mate;i++){
    (is_pred ? e.pred : e.pop).push(org_mate(org, is_pred));
  }

  org.state = wander;
  org.dead = false;
  org.survive = false;
  org.mate = 0;
  org.timeout = 0;
  org.goalref = undefined;
  org.goal = randxy();
  org.orig = org.pos;
}
function org_mate(org, is_pred){
  let child = org_new(is_pred);
  // child.pos = point_copy(org.pos);
  if(rand(1, 100) <= e.config.mutation.chance){
    child.stats.speed += (e.config.mutation.negative ? rand(-1, 1) : 1) * (rand(1, e.config.mutation.max)/10) * org.stats.speed;
    if(child.stats.speed < 0) child.stats.speed = 0;
    e.mutations++;
  }
  if(rand(1, 100) <= e.config.mutation.chance){
    child.stats.stamina += (e.config.mutation.negative ? rand(-1, 1) : 1) * (rand(1, e.config.mutation.max)/10) * org.stats.stamina;
    if(child.stats.stamina < 0) child.stats.stamina = 0;
    e.mutations++;
  }
  if(rand(1, 100) <= e.config.mutation.chance){
    child.stats.sight += (e.config.mutation.negative ? rand(-1, 1) : 1) * (rand(1, e.config.mutation.max)/10) * org.stats.sight;
    if(child.stats.sight < 0) child.stats.sight = 0;
    e.mutations++;
  }
  return child;
}

function food_new(){
  let out = {
    pos: randxy(),
    eaten: false
  };
  out.mesh = render_food_new(out);
  return out;
}
function food_del(food){
  render_food_del(food);
  e.food.splice(e.food.indexOf(food), 1);
}

function world_sim(){
  e.time++;

  if(e.time >= e.config.duration){
    for(let i=e.pop.length-1;i>=0;i--){
      if(e.pop[i].dead || !e.pop[i].survive) org_del(e.pop[i], false);
      else org_reset(e.pop[i], false);
    }

    for(let i=e.food.length-1;i>=0;i--){
      render_food_del(e.food[i]);
      food_del(e.food[i]);
    }
    for(let i=0;i<e.config.foodsize;i++){
      e.food.push(food_new());
    }

    for(let i=e.pred.length-1;i>=0;i--){
      if(e.pred[i].dead || !e.pred[i].survive) org_del(e.pred[i], true);
      else org_reset(e.pred[i], true);
    }

    e.time = 0;
    e.generation++;
    e.is_new_generation = true;
  }
}

/*
 * FUNCTIONS
 */
function init(){
  for(let i=0;i<e.config.popsize;i++){
    e.pop.push(org_new(false));
  }
  for(let i=0;i<e.config.foodsize;i++){
    e.food.push(food_new());
  }
  for(let i=0;i<e.config.predsize;i++){
    e.pred.push(org_new(true));
  }

  document.body.removeChild(d('loading'));
}

function loop(){
  /* Simulate */
  e.pop.forEach((org)=>{
    org_sim(org, false);
  });
  e.pred.forEach((pred)=>{
    org_sim(pred, true);
  });
  world_sim();

  /* Render */
  render_draw(e);

  requestAnimationFrame(loop);
}

/*
 * ENTRY POINT
 */
render_init();
setTimeout(()=>{
  init();
  loop();
}, 1000);
