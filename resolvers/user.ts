import { Prisma } from '@prisma/client'
import { compare, hash } from 'bcrypt'
import { sign } from 'jsonwebtoken'
import { Context } from '@/lib/context'
import { NexusGenArgTypes } from '@/lib/generated/nexus'
import { PaymentMethods } from '@/lib/utils'

type MutationArgs = NexusGenArgTypes['Mutation']

export const registerUser = async (args: MutationArgs['registerUser'], ctx: Context) => {
  try {
    const user = await ctx.prisma.user.create({
      data: {
        name: args.data.name,
        email: args.data.email,
        account: {
          create: {
            hash: await hash(args.data.password, 10)
          }
        },
        role: 'USER',
        shop: {
          create: {
            slug: args.data.shopSlug,
            instagram: args.data.instagram,
            tiktok: args.data.tiktok,
            facebook: args.data.facebook,
            name: args.data.shopName,
            paymentMethodsMetadata: Object.fromEntries(Object.entries(PaymentMethods).filter(([key]) => key !== 'null')),
            phoneNumber: args.data.phoneNumber,
          }
        },
      },
      include: {
        shop: {
          include: {
            logo: true
          },
        },
      }
    })
    await ctx.prisma.shopAccountStatusLog.create({
      data: {
        status: user.shop.status,
        shopId: user.shop.id,
      }
    })
    return {
      token: sign({
        scope: 'user',
        user
      }, import.meta.env.VITE_JWT_SECRET, {
        expiresIn: '7d'
      }),
      user,
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // The .code property can be accessed in a type-safe manner
      if (error.code === 'P2002') {
        throw new Error('Email already exists')
      }
    } else {
      throw new Error(error.message)
    }
  }
}

export const loginUser = async (args: MutationArgs['loginUser'], ctx: Context) => {
  const account = await ctx.prisma.account.findFirst({
    where: {
      user: {
        email: {
          equals: args.data.email,
        },
      },
    },
    include: {
      user: {
        include: {
          shop: true
        },
      },
    }
  })
  if (account && await compare(args.data.password, account.hash)) {
    return {
      token: sign({
        scope: 'user',
        user: account.user
      }, import.meta.env.VITE_JWT_SECRET, {
        expiresIn: '7d'
      }),
      user: account.user
    }
  } else {
    throw new Error('Email or password incorrect')
  }
}

export const updateUser = async (args: MutationArgs['updateUser'], ctx: Context) => {
  try {
    const payload = ctx.getUser()
    const user = await ctx.prisma.user.update({
      where: {
        email: payload.email,
      },
      include: {
        shop: {
          include: {
            logo: true
          }
        }
      },
      data: {
        name: args.data.name || undefined,
        email: args.data.email || undefined,
        shop: args.data.shop ? {
          update: {
            description: args.data.shop.description || undefined,
            country: args.data.shop.country || undefined,
            city: args.data.shop.city || undefined,
            category: args.data.shop.category || undefined,
            instagram: args.data.shop.instagram || undefined,
            facebook: args.data.shop.facebook || undefined,
            tiktok: args.data.shop.tiktok || undefined,
            phoneNumber: args.data.shop.phoneNumber || undefined,
            name: args.data.shop.name || undefined,
            slug: args.data.shop.slug || undefined,
            paymentMethods: args.data.shop.paymentMethods ? [...new Set(args.data.shop.paymentMethods)] : undefined,
            paymentMethodsMetadata: args.data.shop.paymentMethodsMetadata || undefined,
            hasWhatsapp: args.data.shop.hasWhatsapp ?? undefined,
            logo: args.data.shop.logo ? {
              upsert: {
                create: {
                  original: args.data.shop.logo.original || '',
                  normal: args.data.shop.logo.normal || '',
                  thumbnail: args.data.shop.logo.thumbnail || '',
                },
                update: {
                  original: args.data.shop.logo.original || '',
                  normal: args.data.shop.logo.normal || '',
                  thumbnail: args.data.shop.logo.thumbnail || '',
                }
              },
            } : undefined,
          }
        } : undefined,
        account: args.data.password ? {
          update: {
            hash: await hash(args.data.password, 10)
          }
        } : undefined
      }
    })
    if (args.data.shop?.status && args.data.shop.status !== user.shop.status) {
      const user = await ctx.prisma.user.update({
        where: {
          email: payload.email,
        },
        include: {
          shop: {
            include: {
              logo: true
            }
          }
        },
        data: {
          shop: {
            update: {
              status: args.data.shop.status
            }
          },
        }
      })
      await ctx.prisma.shopAccountStatusLog.create({
        data: {
          status: args.data.shop.status,
          shopId: user.shop.id,
        }
      })
      return user
    }
    return user
  } catch (err) {
    throw new Error(err.message)
  }
}
