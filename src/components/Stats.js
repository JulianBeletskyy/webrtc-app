import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { View, Text } from 'react-native'

const Stats = forwardRef((_, ref) => {
  const [data, setData] = useState({qx: 0, qy: 0, qz: 0, qw: 0})
  useImperativeHandle(ref, () => ({
    draw(data) {
      setData(data)
    }
  }))
  return (
    <View>
      <Text style={{fontWeight: 'bold', textAlign: 'center'}}>Orientation</Text>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20}}>
        <Text>QX:</Text>
        <Text>{data.qx.toFixed(2)}</Text>
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20}}>
        <Text>QY:</Text>
        <Text>{data.qy.toFixed(2)}</Text>
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20}}>
        <Text>QZ:</Text>
        <Text>{data.qz.toFixed(2)}</Text>
      </View>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20}}>
        <Text>QW:</Text>
        <Text>{data.qw.toFixed(2)}</Text>
      </View>
    </View>
  )
})

export default Stats