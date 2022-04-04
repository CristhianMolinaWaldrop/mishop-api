import { DeliveryMethodType, PaymentMethods } from '@/lib/utils'
import { enumType, inputObjectType, objectType } from 'nexus'

export const ImageAttachment = objectType({
  name: 'ImageAttachment',
  definition(t) {
    t.nonNull.string('id')
    t.nonNull.string('original')
    t.nonNull.string('normal')
    t.nonNull.string('thumbnail')
  },
})

export const ImageAttachmentInput = inputObjectType({
  name: 'ImageAttachmentInput',
  definition(t) {
    t.string('original')
    t.string('normal')
    t.string('thumbnail')
  },
})

export const PaymentMethodEnum = enumType({
  name: 'PaymentMethodEnum',
  members: Object.keys(PaymentMethods).filter(pm => pm !== 'null'),
})

export const OrderEnum = enumType({
  name: 'OrderEnum',
  members: ['asc', 'desc']
})

export const DeliveryMethodTypeEnum = enumType({
  name: 'DeliveryMethodTypeEnum',
  members: Object.keys(DeliveryMethodType).filter(pm => pm !== 'null')
})
