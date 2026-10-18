/* eslint-disable @typescript-eslint/no-explicit-any */
import { BranchCondition, BranchOperator } from '@activepieces/shared'
import { evaluateConditions } from '../../src/lib/handler/router-executor'

describe('Branch evaluateConditions', () => {
    describe('DATE_IS_AFTER', () => {
        test.each([
            null,
            undefined,
            'not a date',
        ])('should return false when one of the values is not a date %p', (value) => {
            const condition: BranchCondition = {
                firstValue: value as string,
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_AFTER,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return true when first date is after second date', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-02',
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_AFTER,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })

        test.each([
            '2021-01-01',
            '2021-01-02',
        ])('should return false when first date is before or equal to second date', (firstDate) => {
            const condition: BranchCondition = {
                firstValue: firstDate,
                secondValue: '2021-01-02',
                operator: BranchOperator.DATE_IS_AFTER,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return false when the date is not in a supported format', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-02T00:00:00Z',
                secondValue: '1st January 2021',
                operator: BranchOperator.DATE_IS_AFTER,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should compare time', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-01T00:00:02Z',
                secondValue: '2021-01-01T00:00:01Z',
                operator: BranchOperator.DATE_IS_AFTER,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })
    })

    describe('DATE_IS_BEFORE', () => {
        test.each([
            null,
            undefined,
            'not a date',
        ])('should return false when one of the values is not a date %p', (value) => {
            const condition: BranchCondition = {
                firstValue: value as string,
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_BEFORE,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return true when first date is before second date', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-01',
                secondValue: '2021-01-02',
                operator: BranchOperator.DATE_IS_BEFORE,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })

        test.each([
            '2021-01-01',
            '2021-01-02',
        ])('should return false when first date is after or equal to second date', (firstDate) => {
            const condition: BranchCondition = {
                firstValue: firstDate,
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_BEFORE,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return false when the date is not in a supported format', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-02T00:00:00Z',
                secondValue: '2nd January 2021',
                operator: BranchOperator.DATE_IS_BEFORE,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should compare time', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-01T00:00:01Z',
                secondValue: '2021-01-01T00:00:02Z',
                operator: BranchOperator.DATE_IS_BEFORE,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })
    })

    describe('DATE_IS_EQUAL', () => {
        test.each([
            null,
            undefined,
            'not a date',
        ])('should return false when one of the values is not a date %p', (value) => {
            const condition: BranchCondition = {
                firstValue: value as string,
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_EQUAL,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return true when first date is equal to second date', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-01',
                secondValue: '2021-01-01',
                operator: BranchOperator.DATE_IS_EQUAL,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })

        test.each([
            '2021-01-01',
            '2021-01-03',
        ])('should return false when first date is after or before the second date', (firstDate) => {
            const condition: BranchCondition = {
                firstValue: firstDate,
                secondValue: '2021-01-02',
                operator: BranchOperator.DATE_IS_EQUAL,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should return false when the date is not in a supported format', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-02T00:00:00Z',
                secondValue: '2nd January 2021',
                operator: BranchOperator.DATE_IS_EQUAL,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test('should compare time', () => {
            const condition: BranchCondition = {
                firstValue: '2021-01-01T00:00:01Z',
                secondValue: '2021-01-01T00:00:01Z',
                operator: BranchOperator.DATE_IS_EQUAL,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })
    })

    describe('NUMBER_IS_NOT_EQUAL_TO', () => {
        test.each([
            { expected: true, firstValue: '1', secondValue: '2' },
            { expected: true, firstValue: '1.5', secondValue: '2' },
            { expected: false, firstValue: '2', secondValue: '2' },
            { expected: false, firstValue: '2', secondValue: '2.0' },
        ])('should return $expected for $firstValue not equal to $secondValue', ({ expected, firstValue, secondValue }) => {
            const condition: BranchCondition = {
                firstValue,
                secondValue,
                operator: BranchOperator.NUMBER_IS_NOT_EQUAL_TO,
            }

            expect(evaluateConditions([[condition]])).toEqual(expected)
        })
    })

    describe('NUMBER_IS_GREATER_THAN_OR_EQUAL_TO', () => {
        test.each([
            { expected: true, firstValue: '2', secondValue: '1' },
            { expected: true, firstValue: '2', secondValue: '2' },
            { expected: true, firstValue: '2.0', secondValue: '2' },
            { expected: false, firstValue: '1', secondValue: '2' },
        ])('should return $expected for $firstValue greater than or equal to $secondValue', ({ expected, firstValue, secondValue }) => {
            const condition: BranchCondition = {
                firstValue,
                secondValue,
                operator: BranchOperator.NUMBER_IS_GREATER_THAN_OR_EQUAL_TO,
            }

            expect(evaluateConditions([[condition]])).toEqual(expected)
        })
    })

    describe('NUMBER_IS_LESS_THAN_OR_EQUAL_TO', () => {
        test.each([
            { expected: true, firstValue: '1', secondValue: '2' },
            { expected: true, firstValue: '2', secondValue: '2' },
            { expected: true, firstValue: '2', secondValue: '2.0' },
            { expected: false, firstValue: '2', secondValue: '1' },
        ])('should return $expected for $firstValue less than or equal to $secondValue', ({ expected, firstValue, secondValue }) => {
            const condition: BranchCondition = {
                firstValue,
                secondValue,
                operator: BranchOperator.NUMBER_IS_LESS_THAN_OR_EQUAL_TO,
            }

            expect(evaluateConditions([[condition]])).toEqual(expected)
        })
    })

    describe('LIST_IS_EMPTY', () => {
        test.each([
            [],
            '[]',
        ])('should return true when list is empty %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })

        test.each([
            [1],
            '[1]',
        ])('should return false when list is not empty %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test.each([
            null,
            undefined,
            'not a list',
            {},
        ])('should return false when the value is not a list %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })
    })

    describe('LIST_IS_NOT_EMPTY', () => {
        test.each([
            [1],
            '[1]',
        ])('should return true when list is not empty %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_NOT_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(true)
        })

        test.each([
            [],
            '[]',
        ])('should return false when list is empty %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_NOT_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })

        test.each([
            null,
            undefined,
            'not a list',
            {},
        ])('should return false when the value is not a list %p', (input: any) => {
            const condition: BranchCondition = {
                firstValue: input,
                operator: BranchOperator.LIST_IS_NOT_EMPTY,
            }

            expect(evaluateConditions([[condition]])).toEqual(false)
        })
    })

    describe('LIST_CONTAINS', () => {
        test.each([
            { expected: true, list: ['apple', 'banana', 'cherry'], value: 'banana', caseSensitive: false },
            { expected: false, list: ['apple', 'banana', 'cherry'], value: 'Banana', caseSensitive: true },
            { expected: true, list: ['apple', 'banana', 'cherry'], value: 'Banana', caseSensitive: false },
            { expected: true, list: '["apple", "banana", "cherry"]', value: 'banana', caseSensitive: false },
            { expected: true, list: 'apple', value: 'apple', caseSensitive: false },
            { expected: true, list: [1, 2, 3, 4, 5], value: '4', caseSensitive: false },
            { expected: true, list: [1, 2, 3, 4, 5], value: 4, caseSensitive: false },
            { expected: true, list: [true, false, true], value: 'true', caseSensitive: false },
            { expected: true, list: [true, false, true], value: true, caseSensitive: false },
            { expected: true, list: ['true', 'false', 'true'], value: true, caseSensitive: false },
            { expected: true, list: ['true', 'false', 'true'], value: 'true', caseSensitive: false },
        ])('should return $expected for list $list containing $value (case sensitive: $caseSensitive)', ({ expected, list, value, caseSensitive }) => {
            const condition: BranchCondition = {
                firstValue: list as any,
                secondValue: value as any,
                operator: BranchOperator.LIST_CONTAINS,
                caseSensitive,
            }

            expect(evaluateConditions([[condition]])).toEqual(expected)
        })
    })

    describe('LIST_DOES_NOT_CONTAIN', () => {
        test.each([
            { expected: true, list: ['apple', 'banana', 'cherry'], value: 'grape', caseSensitive: false },
            { expected: true, list: ['apple', 'banana', 'cherry'], value: 'Banana', caseSensitive: true },
            { expected: false, list: ['apple', 'banana', 'cherry'], value: 'Banana', caseSensitive: false },
            { expected: true, list: '["apple", "banana", "cherry"]', value: 'grape', caseSensitive: false },
            { expected: true, list: 'apple', value: 'grape', caseSensitive: false },
            { expected: true, list: [1, 2, 3, 4, 5], value: '6', caseSensitive: false },
            { expected: true, list: [1, 2, 3, 4, 5], value: 6, caseSensitive: false },
            { expected: false, list: [true, false, true], value: 'false', caseSensitive: false },
            { expected: false, list: [true, false, true], value: false, caseSensitive: false },
            { expected: false, list: ['true', 'false', 'true'], value: false, caseSensitive: false },
            { expected: false, list: ['true', 'false', 'true'], value: 'false', caseSensitive: false },
        ])('should return $expected for list $list not containing $value (case sensitive: $caseSensitive)', ({ expected, list, value, caseSensitive }) => {
            const condition: BranchCondition = {
                firstValue: list as any,
                secondValue: value as any,
                operator: BranchOperator.LIST_DOES_NOT_CONTAIN,
                caseSensitive,
            }

            expect(evaluateConditions([[condition]])).toEqual(expected)
        })
    })

    describe('NUMBER_IS_NOT_EQUAL_TO, NUMBER_IS_GREATER_THAN_OR_EQUAL_TO, NUMBER_IS_LESS_THAN_OR_EQUAL_TO', () => {
        const evaluate = (operator: BranchOperator, firstValue: unknown, secondValue: unknown) => {
            const condition: BranchCondition = {
                firstValue: firstValue as string,
                secondValue: secondValue as string,
                operator,
            } as BranchCondition
            return evaluateConditions([[condition]])
        }

        test.each([
            ['5', '5', true],
            ['6', '5', true],
            ['4', '5', false],
            [1000000, '1000000', true],
        ])('>= with %p and %p is %p', (first, second, expected) => {
            expect(evaluate(BranchOperator.NUMBER_IS_GREATER_THAN_OR_EQUAL_TO, first, second)).toEqual(expected)
        })

        test.each([
            ['5', '5', true],
            ['4', '5', true],
            ['6', '5', false],
        ])('<= with %p and %p is %p', (first, second, expected) => {
            expect(evaluate(BranchOperator.NUMBER_IS_LESS_THAN_OR_EQUAL_TO, first, second)).toEqual(expected)
        })

        test.each([
            ['5', '5', false],
            ['6', '5', true],
            ['5.0', '5', false],
            ['abc', '5', false],
            [undefined, '5', false],
        ])('!= with %p and %p is %p', (first, second, expected) => {
            expect(evaluate(BranchOperator.NUMBER_IS_NOT_EQUAL_TO, first, second)).toEqual(expected)
        })

        test('works inside AND / OR groups', () => {
            const atLeastFive: BranchCondition = {
                firstValue: '7',
                secondValue: '5',
                operator: BranchOperator.NUMBER_IS_GREATER_THAN_OR_EQUAL_TO,
            } as BranchCondition
            const notTen: BranchCondition = {
                firstValue: '7',
                secondValue: '10',
                operator: BranchOperator.NUMBER_IS_NOT_EQUAL_TO,
            } as BranchCondition
            expect(evaluateConditions([[atLeastFive, notTen]])).toEqual(true)
        })
    })
})
