import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Progress, Typography, Button, Space, Alert } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  UserOutlined, 
  WalletOutlined, 
  TransactionOutlined, 
  DollarOutlined,
  SecurityScanOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { ethers } from 'ethers';
import moment from 'moment';
import styled from 'styled-components';

const { Title, Text } = Typography;

const DashboardContainer = styled.div`
  padding: 24px;
  background: #f5f5f5;
  min-height: 100vh;
`;

const StatCard = styled(Card)`
  .ant-statistic-content {
    color: #1890ff;
  }
`;

const ChartContainer = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeWallets: 0,
    totalTransactions: 0,
    totalGasSponsored: 0,
    pendingOperations: 0,
    failedOperations: 0
  });

  const [transactions, setTransactions] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [gasUsageData, setGasUsageData] = useState([]);
  const [systemHealth, setSystemHealth] = useState({
    bundler: 'healthy',
    paymaster: 'healthy',
    redis: 'healthy',
    provider: 'healthy'
  });

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load statistics
      const statsResponse = await fetch('/api/dashboard/stats');
      const statsData = await statsResponse.json();
      setStats(statsData);

      // Load recent transactions
      const txResponse = await fetch('/api/dashboard/transactions');
      const txData = await txResponse.json();
      setTransactions(txData);

      // Load chart data
      const chartResponse = await fetch('/api/dashboard/charts');
      const chartData = await chartResponse.json();
      setChartData(chartData.volume);
      setUserGrowthData(chartData.users);
      setGasUsageData(chartData.gas);

      // Load system health
      const healthResponse = await fetch('/api/dashboard/health');
      const healthData = await healthResponse.json();
      setSystemHealth(healthData);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const formatEther = (value) => {
    return ethers.utils.formatEther(value || '0');
  };

  const formatGasPrice = (value) => {
    return ethers.utils.formatUnits(value || '0', 'gwei');
  };

  const transactionColumns = [
    {
      title: 'Hash',
      dataIndex: 'hash',
      key: 'hash',
      render: (hash) => (
        <Text code copyable={{ text: hash }}>
          {hash.slice(0, 8)}...{hash.slice(-8)}
        </Text>
      ),
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      render: (user) => (
        <Text code>
          {user.slice(0, 6)}...{user.slice(-4)}
        </Text>
      ),
    },
    {
      title: 'Gas Used',
      dataIndex: 'gasUsed',
      key: 'gasUsed',
      render: (gasUsed) => `${parseInt(gasUsed).toLocaleString()}`,
    },
    {
      title: 'Gas Price',
      dataIndex: 'gasPrice',
      key: 'gasPrice',
      render: (gasPrice) => `${formatGasPrice(gasPrice)} Gwei`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          completed: 'green',
          pending: 'blue',
          failed: 'red'
        };
        return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => moment(timestamp).fromNow(),
    },
  ];

  const pieData = [
    { name: 'Completed', value: stats.totalTransactions - stats.failedOperations - stats.pendingOperations },
    { name: 'Pending', value: stats.pendingOperations },
    { name: 'Failed', value: stats.failedOperations },
  ];

  return (
    <DashboardContainer>
      <Title level={2}>Enterprise AA Dashboard</Title>
      
      {/* System Health Alert */}
      {Object.values(systemHealth).some(status => status !== 'healthy') && (
        <Alert
          message="System Health Warning"
          description="Some system components are not healthy. Please check the system status below."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Key Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Total Users"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </StatCard>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Active Wallets"
              value={stats.activeWallets}
              prefix={<WalletOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </StatCard>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Total Transactions"
              value={stats.totalTransactions}
              prefix={<TransactionOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </StatCard>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Gas Sponsored"
              value={parseFloat(formatEther(stats.totalGasSponsored)).toFixed(4)}
              suffix="ETH"
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </StatCard>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Pending Ops"
              value={stats.pendingOperations}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </StatCard>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard>
            <Statistic
              title="Failed Ops"
              value={stats.failedOperations}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </StatCard>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <ChartContainer>
            <Title level={4}>Transaction Volume (7 Days)</Title>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="transactions" stroke="#1890ff" strokeWidth={2} />
                <Line type="monotone" dataKey="volume" stroke="#52c41a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Col>
        <Col xs={24} lg={8}>
          <ChartContainer>
            <Title level={4}>Transaction Status</Title>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Col>
      </Row>

      {/* User Growth and Gas Usage */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <ChartContainer>
            <Title level={4}>User Growth (30 Days)</Title>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="users" stroke="#1890ff" strokeWidth={2} />
                <Line type="monotone" dataKey="active" stroke="#52c41a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Col>
        <Col xs={24} lg={12}>
          <ChartContainer>
            <Title level={4}>Gas Usage Trends</Title>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={gasUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="gasPrice" stroke="#fa8c16" strokeWidth={2} />
                <Line type="monotone" dataKey="gasUsed" stroke="#722ed1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Col>
      </Row>

      {/* System Health */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card title="System Health">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>Bundler Service</Text>
                  <Progress 
                    percent={systemHealth.bundler === 'healthy' ? 100 : 0}
                    status={systemHealth.bundler === 'healthy' ? 'success' : 'exception'}
                    format={() => systemHealth.bundler}
                  />
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>Paymaster Service</Text>
                  <Progress 
                    percent={systemHealth.paymaster === 'healthy' ? 100 : 0}
                    status={systemHealth.paymaster === 'healthy' ? 'success' : 'exception'}
                    format={() => systemHealth.paymaster}
                  />
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>Redis Cache</Text>
                  <Progress 
                    percent={systemHealth.redis === 'healthy' ? 100 : 0}
                    status={systemHealth.redis === 'healthy' ? 'success' : 'exception'}
                    format={() => systemHealth.redis}
                  />
                </Space>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>Blockchain Provider</Text>
                  <Progress 
                    percent={systemHealth.provider === 'healthy' ? 100 : 0}
                    status={systemHealth.provider === 'healthy' ? 'success' : 'exception'}
                    format={() => systemHealth.provider}
                  />
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Recent Transactions */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card 
            title="Recent Transactions"
            extra={
              <Button type="primary" onClick={loadDashboardData}>
                Refresh
              </Button>
            }
          >
            <Table
              columns={transactionColumns}
              dataSource={transactions}
              rowKey="hash"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>
      </Row>
    </DashboardContainer>
  );
};

export default Dashboard;
