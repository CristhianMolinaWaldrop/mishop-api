import { pageObjectType } from '@/lib/utils'
import { inputObjectType, intArg, nonNull, objectType, queryField, stringArg, mutationField, list, arg, booleanArg } from 'nexus'
import { ImageAttachment, ImageAttachmentInput, OrderEnum } from './common'
import { ShopAccount } from './shop'
import { DeliveryMethod, Product as DProduct, ShopAccount as DShopAccount, ImageAttachment as DImageAttachment, Category as DCategory } from '@prisma/client'

export const Product = objectType({
  name: 'Product',
  definition(t) {
    t.nonNull.string('id')
    t.nonNull.nonEmptyString('name')
    t.string('description')
    t.list.nonNull.field('categories', {type: Category})
    t.nonNull.field('shop', { type: ShopAccount })
    t.list.nonNull.field('images', { type: ImageAttachment })
    t.nonNull.boolean('hasVariants')
    t.nonNull.boolean('visible')
    t.nonNull.boolean('deleted')
    t.list.nonNull.jsonObject('variants')
    t.nonNull.float('price')
    t.nonNull.int('priority')
    t.nonNull.int('position')
    t.float('promotionalPrice')
    t.nonNull.int('stock')
    t.nonNull.int('min')
    t.nonNull.date('createdAt')
  }
})

export const ProductPage = pageObjectType('ProductPage', Product)

export const ProductInput = inputObjectType({
  name: 'ProductInput',
  definition(t) {
    t.string('id')
    t.nonEmptyString('name')
    t.string('description')
    t.list.field('images', { type: ImageAttachmentInput })
    t.list.field('categories', {type: CategoryInput})
    t.list.jsonObject('variants')
    t.float('price')
    t.float('promotionalPrice')
    t.int('stock')
    t.int('min')
    t.int('priority')
    t.int('position')
    t.boolean('visible')
    t.boolean('deleted')
  },
})

export const Category = objectType({
  name: 'Category',
  definition(t) {
    t.nonNull.int('id')
    t.nonEmptyString('name')
    t.nonEmptyString('slug')
    t.list.field('products', { type: Product})
    t.nonNull.date('createdAt')
  },
})
export const CategoryPage = pageObjectType('CategoryPage', Category)

export const CategoryInput = inputObjectType({
  name: 'CategoryInput',
  definition(t) {
    t.int('id')
    t.nonEmptyString('name')
    t.nonEmptyString('slug')
  },
})

export const GetProductsQuery = queryField('getProducts', {
  type: ProductPage,
  args: {
    skip: intArg({ description: 'Skip the first N number of products', default: 0 }),
    take: intArg({ description: 'Take +N products from the current position of cursor', default: 10 }),
    shopId: stringArg({ description: 'Shop id' }),
    visible: booleanArg({ description: 'If is not defined, visible and no visible are listed' }),
    deleted: booleanArg({ description: 'If is not defined, deleted and no deleted are listed' }),
    shopSlug: stringArg({ description: 'Shop slug' }),
    categoryId: intArg({ description: 'Category ID, If is not defined, all categories listed' }),
    categorySlug: stringArg({ description: 'Category slug, If is not defined, all categories listed' }),
    order: arg({
      type: OrderEnum,
      default: 'desc',
    })
  },
  resolve: async (_parent, args, ctx) => {
    let shopId = args.shopId
    if (!args.shopSlug && !shopId) {
      shopId = ctx.getUser().shop?.id
    }
    const where = {
      shopId,
      categories : (args.categoryId || args.categorySlug) ? {
        some: {
          id: args.categoryId ?? undefined,
          slug: args.categorySlug ?? undefined
        }
      } : undefined,
      visible: args.visible ?? undefined,
      deleted: args.deleted ?? undefined,
      shop: {
        id: shopId ?? undefined,
        slug: args.shopSlug ?? undefined,
      }
    }
    const [total, products] = await ctx.prisma.$transaction([
      ctx.prisma.product.count({ where }),
      ctx.prisma.product.findMany({
        skip: args.skip,
        take: args.take,
        where,
        orderBy: [
          {position: args.order},
        ],
        include: {
          images: true,
          categories: true,
          shop: true
        }
      }),
    ])
    return {
      total,
      items: products,
    }
  }
})

export const GetProductQuery = queryField('getProduct', {
  type: Product,
  args: {
    id: nonNull(stringArg()),
  },
  resolve: (_parent, args, ctx) => ctx.prisma.product.findUnique({
    where: { id: args.id },
    include: {
      images: true,
      categories: true,
      shop: {
        include: {
          deliveryMethods: true,
          logo: true,
        }
      }
    }
  })
})

type ProductComplete = DProduct & {
  categories: DCategory[]
  images: DImageAttachment[]
  shop: DShopAccount & {
    logo: DImageAttachment
    deliveryMethods: DeliveryMethod[]
  };
}

export const UpsertProductsMutation = mutationField('upsertProducts', {
  type: list(Product),
  args: {
    data: nonNull(list(ProductInput)),
  },
  resolve: async (_parent, args, ctx) => {
    const shop = ctx.getUser().shop

    const data = args.data.filter(d => Object.keys(d).length)
    const toCreate = data.filter(d => d.id === null || typeof d.id === 'undefined')
    const toUpdate = data.filter(d => d.id)

    let [created, updated, createdInitial]: [any, any, ProductComplete[]] = [[], [], []]

    if (toCreate?.length) {
      createdInitial = await ctx.prisma.$transaction(toCreate.map(p => ctx.prisma.product.create({
        include: {
          images: true,
          categories: true,
          shop: {
            include: {
              deliveryMethods: true,
              logo: true,
            }
          }
        },
        data: {
          shopId: shop.id,
          name: p.name || '',
          description: p.description || undefined,
          price: p.price || 0,
          promotionalPrice: p.promotionalPrice,
          hasVariants: Boolean(p.variants?.length),
          min: p.min || 0,
          stock: p.stock || 0,
          variants: p.variants || [],
          priority: p.priority ?? undefined,
          position: p.position ?? undefined,
          images: p.images?.length ? {
            createMany: {
              data: p.images.map(i => ({
                original: i.original || '',
                normal: i.normal || '',
                thumbnail: i.thumbnail || '',
              }))
            }
          } : undefined,
        }
      })));

      created = await toCreate.map( async (product, ind) => {
        
        if (product.categories){
          let categoryUniquesPromise = product.categories.map( async category => {
            let valueCategory = ctx.prisma.category.findUnique({
              where: {
                slug: category.slug
              },
            });
            return valueCategory;
          });
  
          const categoryUniques = await Promise.all(categoryUniquesPromise);

          let createdCategory = await ctx.prisma.$transaction(product.categories.map((p, index) => {

            return ctx.prisma.product.update({
              where: {
                id: createdInitial[ind].id,
              },
              include: {
                images: true,
                categories: true,
                shop: {
                  include: {
                    deliveryMethods: true,
                    logo: true,
                  }
                }
              },
              data: {
                categories: !categoryUniques[index] ? { create: {name: p.name, slug: p.slug} } :
                { connect: {slug: p.slug } },
              }
            });
          }));
          return createdCategory[createdCategory.length - 1];
        } else {
          return createdInitial[ind];
        }
      })
    }

    if (toUpdate?.length) {
      updated = await toUpdate.map(async p => {
        if(p.categories) {

          let categoryUniquesPromise = p.categories?.map( async category => {
            let valueCategory = ctx.prisma.category.findUnique({
              where: {
                slug: category.slug
              },
            });
            return valueCategory;
          });
  
          const categoryUniques = await Promise.all(categoryUniquesPromise);
  
          let createdCategory = await ctx.prisma.$transaction(p.categories.map((category, index) => {
  
            return ctx.prisma.product.update({
              where: {
                id: p.id,
              },
              include: {
                images: true,
                categories: true,
                shop: {
                  include: {
                    deliveryMethods: true,
                    logo: true,
                  }
                }
              },
              data: {
                ...p,
                categories: !categoryUniques[index] ? { create: {name: category.name, slug: category.slug} } :
                { connect: {slug: category.slug } },
                images: p.images ? {
                  deleteMany: {},
                  createMany: {
                    data: p.images.map(i => ({
                      original: i.original || '',
                      normal: i.normal || '',
                      thumbnail: i.thumbnail || '',
                    }))
                  }
                } : undefined
              }
            });
          }));
          return createdCategory[createdCategory.length - 1];
        } else {

          return ctx.prisma.product.update({
            where: {
              id: p.id,
            },
            include: {
              images: true,
              categories: true,
              shop: {
                include: {
                  deliveryMethods: true,
                  logo: true,
                }
              }
            },
            data: {
              ...p,
              categories: undefined,
              images: p.images ? {
                deleteMany: {},
                createMany: {
                  data: p.images.map(i => ({
                    original: i.original || '',
                    normal: i.normal || '',
                    thumbnail: i.thumbnail || '',
                  }))
                }
              } : undefined
            }
          });
        }
      });
    }

    return [...created, ...updated]
  }
})


export const GetCategoryQuery = queryField('getCategory', {
  type: Category,
  args: {
    slug: stringArg({ description: 'Category Slug' }),
  },
  resolve: async (_parent, args, ctx) => {
    return ctx.prisma.category.findUnique({
      where: { 
        slug: args.slug || undefined
      },
      include: {
        products: {
          include: {
            shop: true,
            images: true
          }
        }
      }
    })
  }
});

export const GetCategoriesQuery = queryField('getCategories', {
  type: CategoryPage,
  args: {
    skip: intArg({ description: 'Skip the first N number of products', default: 0 }),
    take: intArg({ description: 'Take +N products from the current position of cursor', default: 10 }),
    shopId: stringArg({ description: 'Shop id' }),
    shopSlug: stringArg({ description: 'Shop slug' }),
    order: arg({
      type: OrderEnum,
      default: 'desc',
    })
  },
  resolve: async (_parent, args, ctx) => {
    let shopId = args.shopId
    let shopSlug = args.shopSlug
    if (!args.shopSlug && !shopId) {
      shopId = ctx.getUser().shop?.id;
      shopSlug = ctx.getUser().shop?.slug
    }
    const categories = await ctx.prisma.category.findMany({
        skip: args.skip,
        take: args.take,
        orderBy: [{ createdAt: args.order, }],
        where: {
          products: {
            some: {
              shop: {
                id: shopId || undefined,
                slug: shopSlug || undefined
              }
            }
          }
        },
        include: {
          products: {
            where: {
              shop: {
                id: shopId,
                slug: shopSlug
              }
            },
            include: {
              shop: true,
              images: true
            }
          }
        }
      })
    return {
      items: categories,
    }
  }
});
