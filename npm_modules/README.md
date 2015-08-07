## npm_modules folder

This folder is a bit of a hack to get around the fact that we want to install
node modules using the docker container's `npm` in the `Dockerfile` of projects,
we want to use the `--volume` option for `docker run` to mount the code volume
at runtime (including a locally installed `node_modules` directory),
and we want to be able to install on the developers local machines in a way
that keeps inside this repository. Sub-project's `node_modules` symlink to a
sub-project specific `node_modules` here, and so we can install that specifically
on the ontainer using the container's `npm` and that's what the container will use
even if we mount the sub-project's code folder inside the container.
