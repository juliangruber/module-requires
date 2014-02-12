
# module-requires

  TODO: finish me
  
  Refactor modules by listing obsolete and missplaced dependencies.

## Example

```bash
$ module-requires .

  obsolete:
  
    - app-builder
    - component
    - autoprefixer
    - component-builder
    - jade
  
  missplacedDeps:
  
    - herd
    - browserify
    - browserijade
    - mkdirp
    - rework
    - rework-pure-css
    - uglify-js
    - jquery-browserify
    - d3
    - moment
    - globalize
    - minify

$ module-requires ./node_modules/*

./node_modules/utils

  obsolete:

    - seq

  missplacedDeps:

    - should

```

## Installation

```bash
$ npm install -g module-requires
```

## License

  MIT