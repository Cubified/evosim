## evosim

A simple evolution simulator with low-poly graphics.

Built with Three.js and Blender.

### Demo

[Try it here.](https://cubified.github.io/evosim)

### Basic Overview

In this simulation, both predator and prey can evolve to improve three stats:

- Sight:  How far an organism can spot its food (either a fruit for prey, or a prey organism for predators)
- Speed:  How quickly an organism can move
- Stamina:  How long an organism can move

At the start of a new generation every organism begins in "wander" mode, where it chooses a random position, walks there, and chooses another random position upon arrival.  If an organism in wander mode sees a piece of food within its sight radius, it enters into "straight" mode and moves directly towards that piece of food until it can be eaten.

In order for an organism to survive to the next generation, it must consume at least one piece of food.  However, for each additional piece of food it consumes beyond this, it produces one offspring, whose stats have a chance of mutating to produce higher values.

Assuming nothing unexpected happens to cause either population to die out entirely, the emergent behavior of both types of organism valuing speed over any other trait consistently appears.  This makes sense considering the relatively small size of the island, meaning wandering quickly is more effective than always having a specific target in mind.

### To-Do

- Fix antialiasing when using render targets
- Fix ghost organisms remaining in scene when removed from population
- DoF/bokeh blur in fragment shader
- Shirt color to reflect attributes
- Raycasting to keep objects on ground
- More fruits
- Music?

### Credits

The toon water scene (including the tugboat, octopus, and lighthouse models) is from [this repository](https://github.com/OmarShehata/tutsplus-toon-water).  All other 3D models are my own.

Prey eat and new generation "pop" sounds are from Minecraft, and the predator "chomp" sound is from [here](https://www.youtube.com/watch?v=TrS_IllDslA).

Three.js effects (SSAO, Bokeh blur, etc.) are from its [examples folder](https://github.com/mrdoob/three.js/tree/dev/examples/js).
