import React from "react";
import { View } from "react-native";
import RangeSlider from "react-native-range-slider-expo";
import { Colors } from "@/constants/tokens";
import {
  FILTER_SLIDER_BAR_HEIGHT,
  FILTER_SLIDER_CONTAINER_STYLE,
  FILTER_SLIDER_KNOB_SIZE,
  FILTER_SLIDER_WRAP_STYLE,
} from "@/lib/filters/filterSliderStyle";

type FilterAgeRangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  ageMin: number;
  ageMax: number;
  onAgeMinChange: (value: number) => void;
  onAgeMaxChange: (value: number) => void;
  primaryColor: string;
};

export function FilterAgeRangeSlider({
  min,
  max,
  step = 1,
  ageMin,
  ageMax,
  onAgeMinChange,
  onAgeMaxChange,
  primaryColor,
}: FilterAgeRangeSliderProps) {
  return (
    <View style={FILTER_SLIDER_WRAP_STYLE}>
      <RangeSlider
        min={min}
        max={max}
        step={step}
        initialFromValue={ageMin}
        initialToValue={ageMax}
        fromValueOnChange={onAgeMinChange}
        toValueOnChange={onAgeMaxChange}
        fromKnobColor={primaryColor}
        toKnobColor={primaryColor}
        inRangeBarColor={primaryColor}
        outOfRangeBarColor={Colors.gray300}
        showRangeLabels={false}
        showValueLabels={false}
        styleSize={FILTER_SLIDER_KNOB_SIZE}
        knobSize={FILTER_SLIDER_KNOB_SIZE}
        barHeight={FILTER_SLIDER_BAR_HEIGHT}
        containerStyle={FILTER_SLIDER_CONTAINER_STYLE}
      />
    </View>
  );
}
