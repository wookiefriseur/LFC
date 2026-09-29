# LibFurnitureCatalogue

Official Furniture Catalogue database library. Used by FurnitureCatalogue.

- **This Library:** https://www.esoui.com/downloads/info4804-LibFurnitureCatalogue.html
- **Main AddOn:** https://www.esoui.com/downloads/info1617-FurnitureCatalogue.html

This repo contains the following:

1. AddOn src files in [./LibFurnitureCatalogue](./LibFurnitureCatalogue)
2. JSONL datafiles in [docs/data/](./docs/data)
3. generated Lua DB files from the JSONL in [./LibFurnitureCatalogue/data/](./LibFurnitureCatalogue/data/)
4. Webinterface on GitHub pages used to manage the JSONL files

Any tools and webinterface files stay out of the packaged AddOn on ESOUI and you need those only to help with development.

## API documentation

You can use the header of [./LibFurnitureCatalogue/Api.lua](LibFurnitureCatalogue/Api.lua) as reference. 

## Contributing

Use the [webinterface](https://wookiefriseur.github.io/LFC/) to browse the catalogue and contribute data corrections. See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details on data
submission, local development, testing and release instructions.
