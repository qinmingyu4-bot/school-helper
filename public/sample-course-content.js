window.StudyBridgeSampleContent = {
  materials: {
    lecture: {
      title: ["微观经济学讲义", "Microeconomics lecture notes"],
      original: "Lecture notes · Price elasticity",
      sections: [
        {
          title: ["需求价格弹性", "Price elasticity of demand"],
          original: "Price elasticity of demand measures how much quantity demanded responds to a change in price. Compare percentage changes, and use the absolute value: above 1 is elastic; below 1 is inelastic; exactly 1 is unit elastic.",
          translation: "需求价格弹性衡量价格变化时，需求量的反应有多大。比较两个量的百分比变化，并取绝对值。大于 1 是富有弹性，小于 1 是缺乏弹性，等于 1 是单位弹性。"
        },
        {
          title: ["用中点法计算", "The midpoint method"],
          original: "Divide each change by the average of its starting and ending values. This midpoint method gives the same magnitude when the two points are reversed.",
          translation: "分别用起点值与终点值的平均数作为分母。使用中点法时，即使把起点和终点互换，得到的变化幅度也相同。",
          formula: "Elasticity = |(ΔQ ÷ average Q) ÷ (ΔP ÷ average P)|"
        },
        {
          title: ["价格与总收入", "Price and total revenue"],
          original: "Total revenue equals price times quantity sold. Along an unchanged demand curve, if demand is elastic over the price interval, a price increase lowers total revenue.",
          translation: "总收入等于价格乘以销量。沿同一条需求曲线，如果该价格区间的需求富有弹性，提价会降低总收入。"
        }
      ]
    },
    case: {
      title: ["校园咖啡店案例", "Campus coffee shop case"],
      original: "Case study · A campus coffee shop",
      sections: [
        {
          title: ["提价前后发生了什么？", "What changed after the price increase?"],
          original: "A campus café changed the price of its regular coffee from $5 to $6. Average sales fell from 100 cups per day to 80. These figures are fictional teaching data.",
          translation: "一家校园咖啡店把常规咖啡的价格从 5 美元调到 6 美元。日均销量从 100 杯降到 80 杯。数字为虚构教学数据。",
          table: true
        },
        {
          title: ["这组数据能说明什么？", "What can these figures tell us?"],
          original: "The café did not run a controlled experiment. A shift in campus attendance, weather, or competitors’ prices could also affect sales. The two observations can illustrate the calculation, but do not isolate the effect of price.",
          translation: "咖啡店没有做对照实验。到校人数、天气或竞争店铺的价格也可能影响销量。这两个观察值可以用来演示计算，无法单独识别提价造成的影响。"
        }
      ]
    }
  },
  questions: [
    {
      prompt: ["咖啡提价了，为什么收入反而下降？", "Why did revenue fall after the café raised its price?"],
      blocks: [
        { text: ["先看案例。提价前每天收入是 $5 × 100 = $500，提价后是 $6 × 80 = $480。虽然每杯贵了 $1，但少卖了 20 杯，总收入减少了 $20。", "Start with the case. Daily revenue went from $5 × 100 = $500 to $6 × 80 = $480. The café earned $1 more per cup, but sold 20 fewer cups, so revenue fell by $20."], sources: [["case", 0]] },
        { text: ["再用讲义里的中点法。销量变化幅度是 20 ÷ 90 ≈ 22.2%，价格变化幅度是 1 ÷ 5.5 ≈ 18.2%。两者相除约为 1.22。假设其他条件不变，这个区间的需求富有弹性，提价时销量下跌的影响超过了每杯涨价的收益。", "Apply the midpoint method from the lecture. Quantity changed by 20 ÷ 90 ≈ 22.2% and price by 1 ÷ 5.5 ≈ 18.2%. Their ratio is about 1.22. Holding other factors fixed, demand is elastic over this interval, so the lost sales outweigh the extra revenue per cup."], sources: [["lecture", 1], ["lecture", 2]] }
      ]
    },
    {
      prompt: ["为什么中点法要用平均数作分母？", "Why does the midpoint method use an average?"],
      blocks: [
        { text: ["从 $5 涨到 $6，如果用起点作分母，是 1 ÷ 5 = 20%；从 $6 降回 $5，就变成 1 ÷ 6 ≈ 16.7%。同样的一美元差距，仅仅因为计算方向改变，百分比就不同了。", "From $5 to $6, using the starting price gives 1 ÷ 5 = 20%. From $6 back to $5, it gives 1 ÷ 6 ≈ 16.7%. Reversing the same $1 change gives a different magnitude."], sources: [["case", 0]] },
        { text: ["中点法统一用 $5.50 作分母。两个方向的变化幅度都是约 18.2%，只有正负号相反。销量也用相同方法处理。", "The midpoint method uses $5.50 in either direction. The change is about 18.2% both ways, with opposite signs. Use the same approach for quantity."], sources: [["lecture", 1]] }
      ]
    },
    {
      prompt: ["仅凭案例，能断定是提价让销量下降吗？", "Can we tell whether the price increase caused the drop in sales?"],
      blocks: [
        { text: ["只能确认价格上涨和销量下降同时发生。案例没有控制天气、到校人数或其他咖啡店的价格，这些变化也可能影响销量。", "We can observe that price rose and sales fell. The case does not control for weather, campus attendance, or competitor pricing, which could also change sales."], sources: [["case", 1]] },
        { text: ["讲义里「提价会降低收入」有前提：我们沿着同一条需求曲线比较，其他条件保持不变。这个案例适合练习计算，实际经营决策还需要额外证据。", "The lecture’s revenue rule assumes a move along the same demand curve, with other factors held constant. These numbers work as a calculation exercise. A real pricing decision needs more evidence."], sources: [["lecture", 2]] }
      ]
    }
  ],
  quiz: [
    {
      topic: ["计算收入", "Calculate revenue"],
      prompt: ["咖啡提价后，每天的总收入比原来少多少？", "How much did daily revenue fall after the price increase?"],
      choices: [["$20", "$20"], ["$80", "$80"], ["$100", "$100"]],
      correct: 0,
      hint: ["分别用每个时期的单价乘以那个时期的销量。", "Multiply each period’s price by its own quantity sold."],
      feedback: [
        ["提价前是 $500，提价后是 $480，相差 $20。", "Revenue fell from $500 to $480, a difference of $20."],
        ["$80 不是两个时期的收入差。提价后是 $6 × 80 = $480，再与原来的 $500 比较。", "$80 is not the revenue difference. Compare the new $6 × 80 = $480 with the original $500."],
        ["用原价计算少卖的 20 杯会得到 $100，但剩下的 80 杯已经按新价格销售。总收入实际少了 $20。", "Valuing the 20 lost sales at the old price gives $100, but the remaining 80 sell at the new price. Total revenue fell by $20."]
      ],
      source: ["case", 0]
    },
    {
      topic: ["判断弹性", "Interpret elasticity"],
      prompt: ["用中点法算得需求价格弹性约为 1.22。这表示什么？", "Midpoint elasticity is about 1.22. What does that mean?"],
      choices: [["缺乏弹性", "Demand is inelastic"], ["富有弹性", "Demand is elastic"], ["单位弹性", "Demand is unit elastic"]],
      correct: 1,
      hint: ["把弹性数值与 1 比较。", "Compare the elasticity with 1."],
      feedback: [
        ["小于 1 才是缺乏弹性。这里的 1.22 大于 1。", "Inelastic demand has elasticity below 1. Here, 1.22 is above 1."],
        ["1.22 大于 1。销量的百分比变化幅度比价格变化大。", "1.22 is greater than 1. Quantity changed by a larger percentage than price."],
        ["恰好等于 1 才是单位弹性。这里的需求富有弹性。", "Unit elasticity is exactly 1. Demand is elastic here."]
      ],
      source: ["lecture", 0]
    },
    {
      topic: ["区分观察与因果", "Distinguish observation from causation"],
      prompt: ["提价后销量下降。仅凭这组数据，哪句话最稳妥？", "Sales fell after the price increase. What can the data support on their own?"],
      choices: [
        ["一定是提价导致销量下降", "The price increase definitely caused the decline"],
        ["已经排除了天气与到校人数的影响", "Weather and campus attendance have been ruled out"],
        ["观察到了销量下降，但其他因素也可能有影响", "Sales fell, and other factors could have contributed"]
      ],
      correct: 2,
      hint: ["想一想：案例有没有控制其他会影响销量的条件？", "Did the case hold other factors that affect sales constant?"],
      feedback: [
        ["这只是提价前后的观察。要确认因果关系，还需要排除其他影响。", "This is a before-and-after observation. Establishing cause would also require ruling out other influences."],
        ["案例没有控制这些因素，所以天气和到校人数仍可能影响销量。", "Neither factor was controlled, so weather and attendance could still affect sales."],
        ["对。数据能描述变化，案例没有控制其他因素，单独用它无法确定原因。", "Correct. The observations describe the change, but the case did not control for other factors."]
      ],
      source: ["case", 1]
    }
  ]
};
