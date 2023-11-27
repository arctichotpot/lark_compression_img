import { useState, useEffect, useRef, useCallback } from 'react';
import { bitable, ITable, IAttachmentField } from "@lark-base-open/js-sdk";
import { Button, Divider, Image, Space, Typography, Toast, Spin, Form, Card, Tooltip, Popconfirm,Banner } from '@douyinfe/semi-ui';
import imageCompression from 'browser-image-compression';
import { cloneDeep,debounce } from "lodash";
import { IconInfoCircle } from "@douyinfe/semi-icons";
import './App.css';

// 定义类型
type ImageItem = {
  url: string;
  file: File;
  name: string;
  size: number;
  type: string;
  token: string;
  timeStamp: number;
};




type ImageRecordList = {
  fieldId: string;
  recordId: string;
  images: ImageItem[];
};



const formatFileSize = (fileSizeInBytes: number): string => {
  if (fileSizeInBytes < 1024) {
    return fileSizeInBytes + " B";
  } else if (fileSizeInBytes < 1024 * 1024) {
    return (fileSizeInBytes / 1024).toFixed(2) + " KB";
  } else if (fileSizeInBytes < 1024 * 1024 * 1024) {
    return (fileSizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
  } else {
    return (fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
};




export default function App() {

  const [imageRecordList, setImageRecordList] = useState<ImageRecordList[]>([]); // 
  const [compressNum, setCompressNum] = useState<number>(60);
  const [pattern, setPattern] = useState<string>('cell');
  const [loading, setLoading] = useState<boolean>(false);

  const tableRef = useRef<ITable | null>(null);
  const selectionFieldRef = useRef<IAttachmentField | null>(null);
  const lastFieldIdRef = useRef<string | null>(null);


  const isFetchingRef = useRef(false); // 用于标记是否正在获取数据



  const patternRef = useRef(pattern); // 使用 useRef 来跟踪 pattern 的最新值



  useEffect(() => {
    const init = async () => {
      try {
        bitable.base.onSelectionChange(
          debounce(handleSelectionChange, 100) // 使用 lodash 的 debounce 方法
        );
      } catch (e) {
        console.log(e);
      }
    };
    init();
  }, []);


  const handleSelectionChange = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log("Previous fetch in progress, cancelling...");
      return; // 如果正在获取数据，则取消
    }
    console.log(patternRef.current);
    const currentSelection = await bitable.base.getSelection();
    console.log(currentSelection);
    if (currentSelection.fieldId && currentSelection.recordId) {
      if (patternRef.current === 'field' && lastFieldIdRef.current === currentSelection?.fieldId) {
        return;
      }
      lastFieldIdRef.current = currentSelection?.fieldId || null;
      getData();
    } else {
      // setImageRecordList([]);
      // setLoading(false);
    }
  }, []);



  const onPatternChange = async (pa: string) => {
    patternRef.current = pa; // 每次 pattern 更新时，更新其在 useRef 中的值
    console.log(patternRef.current)

    await getData()
  }



  const getData = async () => {
    const currentPattern = patternRef.current; // 使用 useRef 中的最新值


    setLoading(true);

    try {
      tableRef.current = await bitable.base.getActiveTable();
      if (!tableRef.current) {
        setImageRecordList([])
        setLoading(false);

        return;
      }

      const selection = await bitable.base.getSelection();
      if (!selection) {
        setImageRecordList([])
        setLoading(false);
        return;
      }

      const field = await tableRef.current.getField<IAttachmentField>(selection.fieldId as string);
      if (!field) {
        setImageRecordList([])
        setLoading(false);
        return;
      }


      selectionFieldRef.current = field;

      let recordList = [];

      console.log(currentPattern)


      if (currentPattern === 'cell') {
        recordList.push(selection.recordId);
      } else {
        const allRecords = await tableRef.current.getRecordList();
        for (const record of allRecords) {
          recordList.push(record.id)
        }
      }
      console.log(recordList)



      const images = await Promise.all(recordList.map(async recordId => {
        console.log(recordId)
        let imgs: ImageItem[] | [] = []

        const imgItems = await field.getValue(recordId as string);

        console.log(imgItems)

        if (imgItems) {

          imgs = await Promise.all(imgItems.filter(img => img.type.startsWith('image')).map(async img => {
            const url = await tableRef.current?.getAttachmentUrl(img.token) as string;
            return {
              ...img,
              url,
              file: await fetchImageAsFile(url, img.name)
            };
          }))
        }




        return {
          recordId: recordId as string,
          fieldId: selection.fieldId as string,
          images: imgs
        };
      }));

      console.log(images.filter(item => item.images.length > 0))
      console.log(images)


      setImageRecordList(images.filter(item => item.images.length > 0));
    } catch (e) {
      console.error(e);
    } finally {
      isFetchingRef.current = false; // 完成获取数据
      setLoading(false);
    }
  };




  // 压缩
  const handleCompress = async () => {
    setLoading(true)
    const list = cloneDeep(imageRecordList)

    for (const record of list) {
      const arr: ImageItem[] = []
      for (let item of record.images) {
        const file = await imageCompression(item.file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          initialQuality: (100 - compressNum) / 100,
          alwaysKeepResolution: true
        });

        arr.push({ ...item, file })

      }
      record.images = arr
    }

    setImageRecordList(list); // Update state with compressed images
    setLoading(false)
  };

  // 获取照片转File对象
  async function fetchImageAsFile(url: string, name: string): Promise<File> {
    // 使用 fetch 获取图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    // 将响应转换为 Blob
    const blob = await response.blob();
    // 创建并返回 File 对象
    return new File([blob], name, { type: blob.type });
  }

  const confirmCompress = async () => {
    setLoading(true)
    try {

      const resArr: boolean[] = []

      for (let item of imageRecordList) {
        const fileList = item.images.map(file => new File([file.file], file.name, { type: file.type }))
        const res = await selectionFieldRef.current?.setValue(item.recordId as string, fileList)
        resArr.push(res as boolean)
      }

      Toast.info(resArr.includes(false) ? "压缩失败!" : '应用成功!')
      setLoading(false)
    }
    catch (e) {
      setLoading(false)
      console.log(e)
    }

  }


  const ImageListEl = () => {

    return <>
      {
        imageRecordList.map(item => {
          return item.images.map(img => {
            return <Space vertical key={img.name}>
              <Image
                preview={false}
                width={100}
                height={100}
                src={img.url}
              />
              <Typography.Title heading={6} style={{ margin: '8px 0' }} >
                {formatFileSize(img.file.size)}
              </Typography.Title>
            </Space>
          })
        })
      }
    </>


  }

  return (
    <Spin spinning={loading}>
        {/* <Banner 
            type="info"
            description="使用过程中请保持单元"
        /> */}
      <main className="main" >
        <Card  >

          <Form onValueChange={values => {
            setPattern(values.pattern as string)
            setCompressNum(values.compressNum as number)

          }} initValues={{ compressNum, pattern }}>
            <Form.Section text={'压缩设置'}>
              <Form.Slider max={100} min={1} field='compressNum' label={
                <Space>
                  <span> 压缩粒度:{compressNum}</span>
                  <Tooltip content={'压缩的粒度越大,压缩的图片越小'}>
                    <IconInfoCircle />

                  </Tooltip>
                </Space>
              } />

              <Form.Select field='pattern' label="压缩模式" onChange={e => onPatternChange(e as string)}>
                <Form.Select.Option value="cell">压缩当前选中单元格</Form.Select.Option>
                <Form.Select.Option value="field">压缩整列</Form.Select.Option>
              </Form.Select>

            </Form.Section>
          </Form>

          <Space>
            <Button disabled={imageRecordList.length === 0 || loading} theme='solid' onClick={handleCompress} >压缩</Button>
            <Popconfirm
              title="确定要批量更新吗？"
              onConfirm={confirmCompress}
            >
              <Button disabled={imageRecordList.length === 0 || loading} theme='solid' >应用</Button>
            </Popconfirm>

          </Space>
        </Card>

        <Divider margin='12px' />
        {
          imageRecordList.length > 0 ? <ImageListEl /> : `请先选择图片所在${pattern === 'cell' ? '单元格' : '列'}`
        }

      </main>
    </Spin>
  )
}

