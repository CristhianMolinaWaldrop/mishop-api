import jwt from 'jsonwebtoken'
import { AllNexusOutputTypeDefs, GetGen, NexusMetaType } from 'nexus/dist/core'
import { objectType } from 'nexus/dist/core'
import { Context } from './context'

export enum PaymentMethods {
  CASH = null,
  ZELLE = null,
  PAGOMOVIL = null,
  PAYPAL = null,
  POS = null,
}

export enum DeliveryMethodType {
  Delivery = null,
  Pickup = null
}

export const pageObjectType = (name: string, type: GetGen<'allOutputTypes', string> | AllNexusOutputTypeDefs | NexusMetaType) => objectType({
  name,
  definition(t) {
    t.nonNull.int('total')
    t.list.nonNull.field('items', { type })
  }
})

export const getUserFromJWT = async (ctx: Context) => {
  const authHeader = ctx.request?.headers['authorization']
  const bearerLength = 'Bearer '.length
  if (authHeader?.length > bearerLength) {
    const token = authHeader.slice(bearerLength)
    const { ok, result } = await new Promise(resolve =>
      jwt.verify(token, import.meta.env.VITE_JWT_SECRET, (err, result) => {
        if (err) {
          resolve({
            ok: false,
            result: err
          })
        } else {
          resolve({
            ok: true,
            result,
          })
        }
      })
    )
    if (ok) {
      if (result.user?.id && result.scope === 'user') {
        return await ctx.prisma.user.findUnique({
          where: {
            id: String(result.user.id),
          },
          include: {
            shop: {
              include: {
                logo: true
              },
            },
          }
        })
      }
    } else {
      throw new Error(result)
    }
  }
}

export const getCustomerFromJWT = async (ctx: Context) => {
  const token = ctx.request?.headers['x-customer'] as string
  if (token) {
    const { ok, result } = await new Promise(resolve =>
      jwt.verify(token, import.meta.env.VITE_JWT_SECRET, (err, result) => {
        if (err) {
          resolve({
            ok: false,
            result: err
          })
        } else {
          resolve({
            ok: true,
            result,
          })
        }
      })
    )
    if (ok) {
      if (result) {
        return await ctx.prisma.customer.findUnique({
          where: {
            id: String(result),
          },
          include: {
            shop: true
          }
        })
      }
    } else {
      throw new Error(result)
    }
  }
}
