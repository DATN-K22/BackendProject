import { BigIntInterceptor } from '../../utils/interceptors/bigint.interceptor'
import { ExecutionContext, CallHandler } from '@nestjs/common'
import { of } from 'rxjs'

describe('BigIntInterceptor', () => {
  let interceptor: BigIntInterceptor

  beforeEach(() => {
    interceptor = new BigIntInterceptor()
  })

  it('should be defined', () => {
    expect(interceptor).toBeDefined()
  })

  it('should return data immediately if context is not http', (done) => {
    const mockContext = {
      getType: jest.fn().mockReturnValue('rpc') // Giả lập microservice
    } as unknown as ExecutionContext

    const mockHandler = {
      handle: jest.fn().mockReturnValue(of({ value: 10n }))
    } as CallHandler

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result.value).toBe(10n) // Vẫn là BigInt vì không đi qua logic map
      done()
    })
  })

  it('should handle null or undefined data', (done) => {
    const mockContext = {
      getType: jest.fn().mockReturnValue('http')
    } as unknown as ExecutionContext

    const mockHandler = {
      handle: jest.fn().mockReturnValue(of(null))
    } as CallHandler

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toBeNull()
      done()
    })
  })

  it('should convert BigInt to string in response data', (done) => {
    const mockContext = {
      getType: jest.fn().mockReturnValue('http')
    } as unknown as ExecutionContext

    const inputData = {
      id: 1n,
      balance: 5000000000n,
      nested: {
        val: 100n
      },
      name: 'Test User'
    }

    const mockHandler = {
      handle: jest.fn().mockReturnValue(of(inputData))
    } as CallHandler

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(typeof result.id).toBe('string')
      expect(result.id).toBe('1')
      expect(result.balance).toBe('5000000000')
      expect(result.nested.val).toBe('100')
      expect(result.name).toBe('Test User')
      done()
    })
  })
})
