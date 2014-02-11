
# module-requires

  TODO: finish me
  
  Refactor modules by listing obsolete and missplaced dependencies.

## Example

```bash
$ module-requires
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

```

## Installation

```bash
$ npm install -g module-requires
```

## License

  MIT