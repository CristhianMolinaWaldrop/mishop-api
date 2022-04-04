import { Context } from '@/lib/context'
import { NexusGenArgTypes } from '@/lib/generated/nexus'
import { DeliveryMethod as DMethod } from '@prisma/client'

type QueryArgs = NexusGenArgTypes['Query']
type MutationArgs = NexusGenArgTypes['Mutation']

export const getDeliveryMethods = async (args: QueryArgs['getDeliveryMethods'], ctx: Context) => {
  // let shopId
  // if (!args.shopSlug) {
  //   shopId = ctx.getUser()?.shop?.id
  // }
  return await ctx.prisma.deliveryMethod.findMany({
    where: {
      active: args.active ?? undefined,
      deleted: args.deleted ?? undefined,
      shopId: args.shopId ?? undefined,
      shop: {
        id: args.shopId ?? undefined,
        slug: args.shopSlug ?? undefined,
      }
    },
  })
}

export const getDeliveryMethod = (args: QueryArgs['getDeliveryMethods'], ctx: Context) => ctx.prisma.deliveryMethod.findUnique({
  where: {
    id: args.id,
  },
})

export const upsertDeliveryMethods = async (args: MutationArgs['upsertDeliveryMethods'], ctx: Context) => {
  const shop = ctx.getUser().shop

  const data = args.data.filter(d => Object.keys(d).length)

  const toCreate = data.filter(d => d.id === null || typeof d.id === 'undefined')
  const toUpdate = data.filter(d => d.id)

  let [created, updated]: [DMethod[], DMethod[]] = [[], []]

  if (toCreate?.length) {
    created = await ctx.prisma.$transaction(toCreate.map(d => ctx.prisma.deliveryMethod.create({
      data: {
        name: d.name || '',
        description: d.description || undefined,
        specificPaymentMethods: d.specificPaymentMethods ? [...new Set(d.specificPaymentMethods)] : [],
        price: d.price || 0,
        shopId: shop.id,
        type: d.type || 'Delivery'
      }
    })))
  }

  if (toUpdate?.length) {
    const [model] = await ctx.prisma.$transaction(toUpdate.map(d => ctx.prisma.shopAccount.update({
      where: {
        id: shop.id,
      },
      select: {
        deliveryMethods: true
      },
      data: {
        deliveryMethods: {
          update: {
            where: {
              id: d.id,
            },
            data: {
              ...d,
              specificPaymentMethods: d.specificPaymentMethods ? [...new Set(d.specificPaymentMethods)] : undefined,
            },
          }
        }
      }
    })))
    const ids = toUpdate.map(d => d.id)
    updated = model.deliveryMethods.filter(d => ids.includes(d.id))
  }

  return [...created, ...updated]
}
